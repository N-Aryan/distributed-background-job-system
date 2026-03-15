const { validationResult } = require('express-validator');
const taskService = require('../services/taskService');
const logger = require('../config/logger');

class TaskController {
  async createTask(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const task = await taskService.createTask(req.body);

      res.status(201).json({
        success: true,
        data: task,
        message: 'Task created successfully'
      });
    } catch (error) {
      logger.error('Error in createTask controller:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create task',
        message: error.message
      });
    }
  }

  async getTask(req, res) {
    try {
      const { taskId } = req.params;
      const task = await taskService.getTask(taskId);

      if (!task) {
        return res.status(404).json({
          success: false,
          error: 'Task not found'
        });
      }

      res.json({
        success: true,
        data: task
      });
    } catch (error) {
      logger.error('Error in getTask controller:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch task',
        message: error.message
      });
    }
  }

  async listTasks(req, res) {
    try {
      const filters = {
        status: req.query.status,
        priority: req.query.priority,
        type: req.query.type,
        limit: parseInt(req.query.limit) || 50,
        offset: parseInt(req.query.offset) || 0
      };

      const tasks = await taskService.listTasks(filters);

      res.json({
        success: true,
        data: tasks,
        count: tasks.length
      });
    } catch (error) {
      logger.error('Error in listTasks controller:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch tasks',
        message: error.message
      });
    }
  }

  async cancelTask(req, res) {
    try {
      const { taskId } = req.params;
      const task = await taskService.cancelTask(taskId);

      if (!task) {
        return res.status(404).json({
          success: false,
          error: 'Task not found or cannot be cancelled'
        });
      }

      res.json({
        success: true,
        data: task,
        message: 'Task cancelled successfully'
      });
    } catch (error) {
      logger.error('Error in cancelTask controller:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to cancel task',
        message: error.message
      });
    }
  }

  async retryTask(req, res) {
    try {
      const { taskId } = req.params;
      const task = await taskService.retryTask(taskId);

      res.json({
        success: true,
        data: task,
        message: 'Task queued for retry'
      });
    } catch (error) {
      logger.error('Error in retryTask controller:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retry task',
        message: error.message
      });
    }
  }

  async getMetrics(req, res) {
    try {
      const metrics = await taskService.getMetrics();

      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      logger.error('Error in getMetrics controller:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch metrics',
        message: error.message
      });
    }
  }
}

module.exports = new TaskController();