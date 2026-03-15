const express = require('express');
const { body } = require('express-validator');
const taskController = require('../controllers/taskController');

const router = express.Router();

// Validation middleware
const validateTask = [
  body('type').notEmpty().withMessage('Task type is required'),
  body('payload').isObject().withMessage('Payload must be an object'),
  body('priority').optional().isIn(['high', 'medium', 'low']).withMessage('Invalid priority'),
  body('maxRetries').optional().isInt({ min: 0, max: 10 }).withMessage('Invalid max retries')
];

// Routes
router.post('/tasks', validateTask, taskController.createTask);
router.get('/tasks', taskController.listTasks);
router.get('/tasks/:taskId', taskController.getTask);
router.delete('/tasks/:taskId', taskController.cancelTask);
router.post('/tasks/:taskId/retry', taskController.retryTask);
router.get('/metrics', taskController.getMetrics);

module.exports = router;