// api/src/app.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const taskRoutes = require('./routes/taskRoutes');
const rateLimiter = require('./middleware/rateLimiter');
const logger = require('./config/logger');

// Import connections to initialize them
require('./config/database');
require('./config/redis');
const taskService = require('./services/taskService');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
app.use(rateLimiter.middleware());

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date(),
    uptime: process.uptime()
  });
});

// API routes
app.use('/api/v1', taskRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const PORT = process.env.PORT || 3000;

// Start server
async function startServer() {
  try {
    // Initialize task service (connects to RabbitMQ)
    await taskService.initialize();

    app.listen(PORT, () => {
      logger.info(`🚀 API Server running on port ${PORT}`);
      logger.info(`📊 Health check: http://localhost:${PORT}/health`);
      logger.info(`🔗 API endpoint: http://localhost:${PORT}/api/v1`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});