const redisClient = require('../config/redis');
const logger = require('../config/logger');

class RateLimiter {
  constructor() {
    this.windowSize = parseInt(process.env.RATE_LIMIT_WINDOW) || 3600; // 1 hour
    this.maxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000;
  }

  async checkLimit(clientId) {
    const key = `ratelimit:${clientId}`;
    const now = Date.now();
    const windowStart = now - (this.windowSize * 1000);

    try {
      // Remove old entries
      await redisClient.zRemRangeByScore(key, 0, windowStart);

      // Add current request
      await redisClient.zAdd(key, {
        score: now,
        value: `${now}-${Math.random()}`
      });

      // Count requests in window
      const requestCount = await redisClient.zCard(key);

      // Set expiry
      await redisClient.expire(key, this.windowSize);

      const allowed = requestCount <= this.maxRequests;
      const remaining = Math.max(0, this.maxRequests - requestCount);

      return {
        allowed,
        remaining,
        resetAt: now + (this.windowSize * 1000),
        limit: this.maxRequests
      };
    } catch (error) {
      logger.error('Rate limiter error:', error);
      // Fail open - allow request if Redis is down
      return { allowed: true, remaining: this.maxRequests };
    }
  }

  middleware() {
    return async (req, res, next) => {
      // Use IP address as client identifier (or API key if available)
      const clientId = req.headers['x-api-key'] || 
                       req.ip || 
                       req.connection.remoteAddress;

      const result = await this.checkLimit(clientId);

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', result.limit || this.maxRequests);
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader('X-RateLimit-Reset', result.resetAt);

      if (!result.allowed) {
        return res.status(429).json({
          error: 'Too many requests',
          message: `Rate limit exceeded. Try again after ${new Date(result.resetAt).toISOString()}`,
          retryAfter: result.resetAt
        });
      }

      next();
    };
  }
}

module.exports = new RateLimiter();