const db = require('../config/database');
const redisClient = require('../config/redis');
const rabbitmqConnection = require('../config/rabbitmq');
const logger = require('../config/logger');

class TaskService {
  constructor() {
    this.channel = null;
  }

  async initialize() {
    this.channel = await rabbitmqConnection.connect();
  }

  async createTask(taskData) {
    const client = await db.connect();
    
    try {
      await client.query('BEGIN');

      // Insert task into database
      const insertQuery = `
        INSERT INTO tasks (type, priority, payload, scheduled_at, max_retries)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;

      const values = [
        taskData.type,
        taskData.priority || 'medium',
        JSON.stringify(taskData.payload),
        taskData.scheduledAt || null,
        taskData.maxRetries || 3
      ];

      const result = await client.query(insertQuery, values);
      const task = result.rows[0];

      // Publish to appropriate queue
      const queueName = `tasks.${task.priority}`;
      const message = {
        taskId: task.id,
        type: task.type,
        payload: task.payload,
        priority: task.priority
      };

      const priorityValue = this.getPriorityValue(task.priority);

      await this.channel.sendToQueue(
        queueName,
        Buffer.from(JSON.stringify(message)),
        {
          persistent: true,
          priority: priorityValue
        }
      );

      // Update metrics in Redis
      await redisClient.incr(`metrics:tasks:submitted:${task.priority}`);
      await redisClient.incr('metrics:tasks:total');

      await client.query('COMMIT');

      logger.info(`Task created: ${task.id} (${task.type})`);

      return task;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating task:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getTask(taskId) {
    const query = 'SELECT * FROM tasks WHERE id = $1';
    const result = await db.query(query, [taskId]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  async listTasks(filters = {}) {
    let query = 'SELECT * FROM tasks WHERE 1=1';
    const values = [];
    let paramCount = 1;

    if (filters.status) {
      query += ` AND status = $${paramCount}`;
      values.push(filters.status);
      paramCount++;
    }

    if (filters.priority) {
      query += ` AND priority = $${paramCount}`;
      values.push(filters.priority);
      paramCount++;
    }

    if (filters.type) {
      query += ` AND type = $${paramCount}`;
      values.push(filters.type);
      paramCount++;
    }

    query += ' ORDER BY created_at DESC';

    if (filters.limit) {
      query += ` LIMIT $${paramCount}`;
      values.push(filters.limit);
      paramCount++;
    } else {
      query += ' LIMIT 100';
    }

    if (filters.offset) {
      query += ` OFFSET $${paramCount}`;
      values.push(filters.offset);
    }

    const result = await db.query(query, values);
    return result.rows;
  }

  async cancelTask(taskId) {
    const query = `
      UPDATE tasks 
      SET status = 'cancelled', completed_at = NOW()
      WHERE id = $1 AND status IN ('pending', 'retrying')
      RETURNING *
    `;

    const result = await db.query(query, [taskId]);
    
    if (result.rows.length === 0) {
      return null;
    }

    logger.info(`Task cancelled: ${taskId}`);
    return result.rows[0];
  }

  async retryTask(taskId) {
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // Get task
      const getQuery = 'SELECT * FROM tasks WHERE id = $1 FOR UPDATE';
      const taskResult = await client.query(getQuery, [taskId]);

      if (taskResult.rows.length === 0) {
        throw new Error('Task not found');
      }

      const task = taskResult.rows[0];

      if (task.status !== 'failed') {
        throw new Error('Only failed tasks can be retried');
      }

      // Reset task
      const updateQuery = `
        UPDATE tasks 
        SET status = 'pending', retry_count = 0, error_message = NULL
        WHERE id = $1
        RETURNING *
      `;

      const updateResult = await client.query(updateQuery, [taskId]);

      // Re-publish to queue
      const queueName = `tasks.${task.priority}`;
      const message = {
        taskId: task.id,
        type: task.type,
        payload: task.payload,
        priority: task.priority
      };

      await this.channel.sendToQueue(
        queueName,
        Buffer.from(JSON.stringify(message)),
        {
          persistent: true,
          priority: this.getPriorityValue(task.priority)
        }
      );

      await client.query('COMMIT');

      logger.info(`Task retried: ${taskId}`);
      return updateResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error retrying task:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getMetrics() {
    try {
      // Task statistics from database
      const statsQuery = `
        SELECT 
          status,
          priority,
          COUNT(*) as count
        FROM tasks
        WHERE created_at > NOW() - INTERVAL '24 hours'
        GROUP BY status, priority
      `;

      const statsResult = await db.query(statsQuery);

      // Queue statistics from Redis
      const priorities = ['high', 'medium', 'low'];
      const queueStats = {};

      for (const priority of priorities) {
        const submitted = await redisClient.get(`metrics:tasks:submitted:${priority}`) || '0';
        const completed = await redisClient.get(`metrics:tasks:completed:${priority}`) || '0';
        
        queueStats[priority] = {
          submitted: parseInt(submitted),
          completed: parseInt(completed)
        };
      }

      // Total tasks
      const total = await redisClient.get('metrics:tasks:total') || '0';

      return {
        taskStats: statsResult.rows,
        queueStats,
        totalTasks: parseInt(total),
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Error fetching metrics:', error);
      throw error;
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
}

module.exports = new TaskService();