// api/src/config/rabbitmq.js
const amqp = require('amqplib');
require('dotenv').config();

class RabbitMQConnection {
  constructor() {
    this.connection = null;
    this.channel = null;
  }

  async connect() {
    try {
      const url = `amqp://${process.env.RABBITMQ_USER}:${process.env.RABBITMQ_PASSWORD}@${process.env.RABBITMQ_HOST}:${process.env.RABBITMQ_PORT}`;
      
      this.connection = await amqp.connect(url);
      this.channel = await this.connection.createChannel();

      console.log('✅ RabbitMQ connected');

      // Setup queues
      await this.setupQueues();

      // Handle connection errors
      this.connection.on('error', (err) => {
        console.error('❌ RabbitMQ connection error:', err);
      });

      this.connection.on('close', () => {
        console.log('⚠️ RabbitMQ connection closed. Reconnecting...');
        setTimeout(() => this.connect(), 5000);
      });

      return this.channel;
    } catch (error) {
      console.error('❌ RabbitMQ connection failed:', error);
      setTimeout(() => this.connect(), 5000);
    }
  }

  async setupQueues() {
    // Priority queues
    await this.channel.assertQueue('tasks.high', {
      durable: true,
      maxPriority: 10
    });

    await this.channel.assertQueue('tasks.medium', {
      durable: true,
      maxPriority: 10
    });

    await this.channel.assertQueue('tasks.low', {
      durable: true,
      maxPriority: 10
    });

    // Dead Letter Queue
    await this.channel.assertQueue('tasks.dlq', {
      durable: true
    });

    console.log('✅ RabbitMQ queues setup complete');
  }

  getChannel() {
    return this.channel;
  }

  async close() {
    await this.channel.close();
    await this.connection.close();
  }
}

module.exports = new RabbitMQConnection();