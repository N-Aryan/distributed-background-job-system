// worker/src/worker.js
const WorkerService = require('./services/workerService');
const logger = require('./config/logger');
require('dotenv').config();

const workerService = new WorkerService();

async function startWorker() {
  try {
    await workerService.start();
  } catch (error) {
    logger.error('Failed to start worker:', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function gracefulShutdown(signal) {
  logger.info(`${signal} received, shutting down gracefully...`);
  
  try {
    await workerService.shutdown();
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

// Start worker
startWorker();