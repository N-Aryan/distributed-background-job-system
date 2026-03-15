const amqp = require('amqplib');
const db = require('../config/database');
const redisClient = require('../config/redis');
const logger = require('../config/logger');
const handlers = require('../handlers');
require('dotenv').config();

class WorkerService {
  constructor() {
    this.workerId = process.env.WORKER_ID || `worker-${Date.now()}`;
    this.connection = null;
    this.channel = null;
    this.isProcessing = false;
    this.currentTask = null;
    this.tasksProcessed = 0;
  }

  async start() {
    try {
      // Connect to RabbitMQ
      await this.connectRabbitMQ();

      // Register worker in Redis
      await this.registerWorker();

      // Start consuming from queues
      await this.consumeQueues();

      // Heartbeat
      this.startHeartbeat();

      logger.info(`✅ Worker ${this.workerId} started successfully`);
    } catch (error) {
      logger.error('Failed to start worker:', error);
      process.exit(1);
    }
  }

  async connectRabbitMQ() {
    const url = `amqp://${process.env.RABBITMQ_USER}:${process.env.RABBITMQ_PASSWORD}@${process.env.RABBITMQ_HOST}:${process.env.RABBITMQ_PORT}`;
    
    this.connection = await amqp.connect(url);
    this.channel = await this.connection.createChannel();

    // Set prefetch count
    await this.channel.prefetch(parseInt(process.env.PREFETCH_COUNT) || 1);

    logger.info('✅ Worker connected to RabbitMQ');

    // Handle connection errors
    this.connection.on('error', (err) => {
      logger.error('RabbitMQ connection error:', err);
    });

    this.connection.on('close', () => {
      logger.warn('RabbitMQ connection closed. Reconnecting...');
      setTimeout(() => this.connectRabbitMQ(), 5000);
    });
  }

  async registerWorker() {
    await redisClient.sAdd('workers:active', this.workerId);
    await redisClient.set(`worker:${this.workerId}:started`, new Date().toISOString());
    logger.info(`Worker ${this.workerId} registered`);
  }

  async consumeQueues() {
    const queues = ['tasks.high', 'tasks.medium', 'tasks.low'];

    for (const queue of queues) {
      await this.channel.assertQueue(queue, {
        durable: true,
        maxPriority: 10
      });

      await this.channel.consume(
        queue,
        (msg) => this.processMessage(msg, queue),
        { noAck: false }
      );

      logger.info(`Consuming from queue: ${queue}`);
    }

    // Also listen to DLQ for monitoring
    await this.channel.assertQueue('tasks.dlq', { durable: true });
  }

  async processMessage(msg, queueName) {
    if (!msg) return;

    this.isProcessing = true;
    const startTime = Date.now();
    
    let taskData;
    try {
      taskData = JSON.parse(msg.content.toString());
      this.currentTask = taskData.taskId;

      logger.info(`Processing task ${taskData.taskId} (${taskData.type})`);

      // Update task status to processing
      await this.updateTaskStatus(taskData.taskId, 'processing', startTime);

      // Execute task
      const result = await this.executeTask(taskData);

      // Mark as completed
      await this.completeTask(taskData.taskId, result, startTime);

      // Acknowledge message
      this.channel.ack(msg);

      // Update metrics
      await this.updateMetrics(taskData.type, 'completed');

      this.tasksProcessed++;
      logger.info(`Task ${taskData.taskId} completed successfully`);

    } catch (error) {
      logger.error(`Task ${taskData?.taskId} failed:`, error);
      await this.handleTaskFailure(msg, taskData, error, queueName, startTime);
    } finally {
      this.isProcessing = false;
      this.currentTask = null;
    }
  }

  async executeTask(taskData) {
    const handler = handlers[taskData.type];

    if (!handler) {
      throw new Error(`Unknown task type: ${taskData.type}`);
    }

    // Execute with timeout
    const timeout = 60000; // 60 seconds
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Task execution timeout')), timeout)
    );

    const result = await Promise.race([
      handler.execute(taskData.payload),
      timeoutPromise
    ]);

    return result;
  }

  async updateTaskStatus(taskId, status, startTime) {
    const query = `
      UPDATE tasks 
      SET status = $1, started_at = $2
      WHERE id = $3
    `;
    
    await db.query(query, [status, new Date(startTime), taskId]);
  }

  async completeTask(taskId, result, startTime) {
    const executionTime = Date.now() - startTime;

    // Update task
    const updateQuery = `
      UPDATE tasks 
      SET status = 'completed', 
          completed_at = NOW(), 
          result = $1
      WHERE id = $2
    `;
    
    await db.query(updateQuery, [JSON.stringify(result), taskId]);

    // Log execution
    const logQuery = `
      INSERT INTO task_executions 
      (task_id, worker_id, started_at, completed_at, status, execution_time_ms)
      VALUES ($1, $2, $3, NOW(), 'completed', $4)
    `;
    
    await db.query(logQuery, [taskId, this.workerId, new Date(startTime), executionTime]);
  }

  async handleTaskFailure(msg, taskData, error, queueName, startTime) {
    try {
      // Get current retry count
      const taskQuery = `
        SELECT retry_count, max_retries, priority 
        FROM tasks 
        WHERE id = $1
      `;
      
      const taskResult = await db.query(taskQuery, [taskData.taskId]);
      
      if (taskResult.rows.length === 0) {
        logger.error(`Task ${taskData.taskId} not found in database`);
        this.channel.ack(msg);
        return;
      }

      const { retry_count, max_retries, priority } = taskResult.rows[0];

      // Log failed execution
      const executionTime = Date.now() - startTime;
      const logQuery = `
        INSERT INTO task_executions 
        (task_id, worker_id, started_at, completed_at, status, error_message, execution_time_ms)
        VALUES ($1, $2, $3, NOW(), 'failed', $4, $5)
      `;
      
      await db.query(logQuery, [
        taskData.taskId, 
        this.workerId, 
        new Date(startTime), 
        error.message,
        executionTime
      ]);

      if (retry_count < max_retries) {
        // Retry with exponential backoff
        const retryCount = retry_count + 1;
        const delay = Math.min(1000 * Math.pow(2, retry_count), 60000);

        logger.info(`Task ${taskData.taskId} will retry (${retryCount}/${max_retries}) in ${delay}ms`);

        // Update retry count
        await db.query(
          `UPDATE tasks SET retry_count = $1, status = 'retrying' WHERE id = $2`,
          [retryCount, taskData.taskId]
        );

        // Requeue with delay
        setTimeout(() => {
          this.channel.sendToQueue(
            queueName,
            msg.content,
            { persistent: true, priority: this.getPriorityValue(priority) }
          );
        }, delay);

        this.channel.ack(msg);

      } else {
        // Max retries reached - move to DLQ
        logger.error(`Task ${taskData.taskId} failed permanently after ${max_retries} retries`);

        await db.query(
          `UPDATE tasks 
           SET status = 'failed', 
               completed_at = NOW(), 
               error_message = $1 
           WHERE id = $2`,
          [error.message, taskData.taskId]
        );

        // Send to DLQ
        this.channel.sendToQueue('tasks.dlq', msg.content, {
          persistent: true,
          headers: {
            'x-original-queue': queueName,
            'x-error': error.message,
            'x-failed-at': new Date().toISOString()
          }
        });

        this.channel.ack(msg);

        // Update metrics
        await this.updateMetrics(taskData.type, 'failed');
      }
    } catch (err) {
      logger.error('Error handling task failure:', err);
      // Reject and requeue
      this.channel.nack(msg, false, true);
    }
  }

  async updateMetrics(taskType, status) {
    try {
      await redisClient.incr(`metrics:tasks:${status}:${taskType}`);
      await redisClient.incr(`worker:${this.workerId}:processed`);
      await redisClient.incr('workers:total_processed');
    } catch (error) {
      logger.error('Error updating metrics:', error);
    }
  }

  getPriorityValue(priority) {
    const priorities = {
      'high': 10,
      'medium': 5,
      'low': 1
    };
    return priorities[priority] || 5;
  }

  startHeartbeat() {
    setInterval(async () => {
      try {
        await redisClient.set(
          `worker:${this.workerId}:heartbeat`,
          new Date().toISOString(),
          { EX: 60 }
        );

        await redisClient.set(
          `worker:${this.workerId}:status`,
          JSON.stringify({
            isProcessing: this.isProcessing,
            currentTask: this.currentTask,
            tasksProcessed: this.tasksProcessed,
            uptime: process.uptime()
          }),
          { EX: 60 }
        );
      } catch (error) {
        logger.error('Heartbeat error:', error);
      }
    }, 10000); // Every 10 seconds
  }

  async shutdown() {
    logger.info('Shutting down worker gracefully...');

    // Stop accepting new messages
    if (this.channel) {
      await this.channel.close();
    }

    // Wait for current task to complete (with timeout)
    const shutdownTimeout = 30000;
    const startShutdown = Date.now();

    while (this.isProcessing && (Date.now() - startShutdown) < shutdownTimeout) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (this.isProcessing) {
      logger.warn('Forced shutdown - task may be incomplete');
    }

    // Unregister worker
    await redisClient.sRem('workers:active', this.workerId);
    await redisClient.del(`worker:${this.workerId}:heartbeat`);
    await redisClient.del(`worker:${this.workerId}:status`);

    // Close connections
    if (this.connection) {
      await this.connection.close();
    }

    logger.info('Worker shutdown complete');
  }
}

module.exports = WorkerService;