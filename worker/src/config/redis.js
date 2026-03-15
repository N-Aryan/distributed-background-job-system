const redis = require('redis');
require('dotenv').config();

const redisClient = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT
  }
});

redisClient.on('connect', () => {
  console.log('✅ Redis connected');
});

redisClient.on('error', (err) => {
  console.error('❌ Redis error:', err);
});

// Connect
(async () => {
  try {
    await redisClient.connect();
  } catch (err) {
    console.error('❌ Redis connection failed:', err);
    process.exit(-1);
  }
})();

module.exports = redisClient;