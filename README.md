# Distributed Task Queue System

<div align="center">

![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-blue.svg)
![Redis](https://img.shields.io/badge/Redis-7-red.svg)
![RabbitMQ](https://img.shields.io/badge/RabbitMQ-3.12-orange.svg)
![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)
![License](https://img.shields.io/badge/License-MIT-yellow.svg)

A production-ready distributed task queue system that handles asynchronous job processing with reliability, scalability, and monitoring capabilities.

[Features](#-features) • [Architecture](#-architecture) • [Getting Started](#-getting-started) • [API Documentation](#-api-documentation)

</div>

---

## 📋 Table of Contents

- [Purpose](#-purpose)
- [Features](#-features)
- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
- [API Documentation](#-api-documentation)
- [Monitoring](#-monitoring)
- [Testing](#-testing)
- [Project Structure](#-project-structure)
- [Use Cases](#-use-cases)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🎯 Purpose

### What Problem Does This Solve?

Modern web applications need to handle time-consuming operations without blocking user requests. This distributed task queue system solves several critical challenges:

**Key Problems:**
- **User Experience**: Users wait too long for responses when heavy processing happens synchronously
- **System Reliability**: Services fail when dependent systems are temporarily down
- **Traffic Spikes**: Servers crash during high-load events (Black Friday, viral content)
- **Priority Management**: Critical tasks (password resets, payments) delayed by low-priority tasks (newsletters)
- **Operational Visibility**: No insight into failed background jobs

**Solutions:**
- ✅ Instant API responses with background processing
- ✅ Automatic retries when services recover
- ✅ Queue buffers traffic spikes
- ✅ Three-tier priority system
- ✅ Real-time monitoring and dead letter queue

### Real-World Applications

| Industry | Use Cases |
|----------|-----------|
| **E-commerce** | Order processing, payment verification, inventory updates, email notifications |
| **Media Platforms** | Video transcoding, image processing, thumbnail generation |
| **SaaS Applications** | Report generation, data exports, bulk operations |
| **Communication** | Email campaigns, SMS broadcasts, push notifications |
| **Data Processing** | ETL pipelines, analytics, scheduled reports |

### Why This Architecture?

- **Decoupling**: API and processing layers scale independently
- **Horizontal Scaling**: Add workers without code changes
- **Observability**: Built-in metrics and monitoring
- **Resilience**: Automatic retries and graceful degradation
- **Cost Efficiency**: Auto-scaling based on demand

---

## ✨ Features

### Core Capabilities

- ✅ **Priority Queuing**: Three-tier priority system (high, medium, low)
- ✅ **Automatic Retries**: Exponential backoff (2s → 4s → 8s → 16s → 60s max)
- ✅ **Dead Letter Queue**: Isolate permanently failed tasks
- ✅ **Rate Limiting**: Redis-based sliding window (1000 req/hour)
- ✅ **Worker Pool**: Dynamic auto-scaling based on queue depth
- ✅ **Task Scheduling**: Schedule tasks for future execution
- ✅ **Real-time Dashboard**: Live metrics with auto-refresh
- ✅ **Graceful Shutdown**: Complete current tasks before stopping
- ✅ **Health Checks**: Kubernetes-ready endpoints
- ✅ **Task Cancellation**: Cancel pending/retrying tasks
- ✅ **Execution History**: Complete audit trail

### Performance Targets

- **Throughput**: 100,000+ tasks per day
- **API Latency**: <100ms (p95: 85ms)
- **Reliability**: 99.9% completion rate
- **Scalability**: Horizontal worker scaling

---

## 🏗 Architecture

### High-Level Design (HLD)
```
┌─────────────────────────────────────────────────────────┐
│                   Client Applications                    │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP/REST
                         ▼
┌─────────────────────────────────────────────────────────┐
│              API Gateway (Node.js + Express)             │
│  Rate Limiter → Validation → Controller → Response      │
└────────────────────────┬────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
    ┌──────────┐   ┌──────────┐   ┌──────────┐
    │ RabbitMQ │   │  Redis   │   │PostgreSQL│
    │  Queues  │   │  Cache   │   │ Database │
    └────┬─────┘   └──────────┘   └──────────┘
         │
    ┌────┴────┐
    ▼    ▼    ▼
┌──────────────────────────────────────────────────────────┐
│                    Worker Pool                           │
│  Worker 1  |  Worker 2  |  Worker 3  |  Worker N        │
└──────────────────────────────────────────────────────────┘
         │
         ▼
   ┌─────────────┐
   │   Task      │
   │  Handlers   │
   └─────────────┘
```

### Component Overview

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **API Gateway** | Node.js + Express | RESTful API for task management |
| **Message Broker** | RabbitMQ | Priority queuing with persistence |
| **Database** | PostgreSQL | Task metadata and history |
| **Cache** | Redis | Rate limiting and metrics |
| **Workers** | Node.js | Task execution with retry logic |
| **Dashboard** | HTML/JS | Real-time monitoring |

### Data Flow

**Task Submission:**
```
Client → API → Rate Limiter → Validation → DB (persist) → Queue → Response (200ms)
```

**Task Processing:**
```
Queue → Worker → Handler → Update DB → Update Metrics → ACK
```

**Task Retry:**
```
Failure → Check Count → (If < Max) → Backoff Delay → Requeue
                      → (If >= Max) → DLQ + Mark Failed
```

### Task Lifecycle
```
PENDING → PROCESSING → COMPLETED
                    ↓
                 RETRYING → (back to PENDING)
                    ↓
                  FAILED → DLQ
```

---

## 🔧 Low-Level Design (LLD)

### Database Schema
```sql
-- Tasks table
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(50) NOT NULL,
    priority VARCHAR(20) DEFAULT 'medium',
    payload JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    created_at TIMESTAMP DEFAULT NOW(),
    scheduled_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    result JSONB
);

-- Indexes
CREATE INDEX idx_tasks_status_priority ON tasks(status, priority, created_at DESC);
CREATE INDEX idx_tasks_scheduled_at ON tasks(scheduled_at) WHERE scheduled_at IS NOT NULL;

-- Task executions (audit trail)
CREATE TABLE task_executions (
    id SERIAL PRIMARY KEY,
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    worker_id VARCHAR(100) NOT NULL,
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    status VARCHAR(20) NOT NULL,
    error_message TEXT,
    execution_time_ms INTEGER
);

-- Rate limiting
CREATE TABLE rate_limits (
    client_id VARCHAR(100) PRIMARY KEY,
    request_count INTEGER DEFAULT 0,
    window_start TIMESTAMP DEFAULT NOW()
);
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/tasks` | Create a new task |
| GET | `/api/v1/tasks` | List tasks with filters |
| GET | `/api/v1/tasks/:id` | Get task details |
| DELETE | `/api/v1/tasks/:id` | Cancel a task |
| POST | `/api/v1/tasks/:id/retry` | Retry failed task |
| GET | `/api/v1/metrics` | System metrics |
| GET | `/api/v1/health` | Health check |

### Retry Strategy

**Exponential Backoff with Jitter:**
```javascript
delay = min(1000 * 2^retry_count + random(0-1000), 60000)
```

**Example:**
- Retry 0: ~2 seconds
- Retry 1: ~4 seconds
- Retry 2: ~8 seconds
- Retry 3: ~16 seconds
- Retry 4+: 60 seconds (max)

---

## 🛠 Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| **Node.js** | 18+ | Runtime environment |
| **Express** | 4.x | Web framework |
| **PostgreSQL** | 15 | Primary database |
| **Redis** | 7 | Cache & metrics |
| **RabbitMQ** | 3.12 | Message broker |
| **Docker** | 20+ | Containerization |
| **Docker Compose** | 2.x | Orchestration |

**Key Libraries:**
- `pg` - PostgreSQL client
- `redis` - Redis client
- `amqplib` - RabbitMQ client
- `winston` - Logging
- `express-validator` - Input validation

---

## 🚀 Getting Started

### Prerequisites

| Software | Minimum Version | Download |
|----------|----------------|----------|
| **Node.js** | 18.0.0 | [nodejs.org](https://nodejs.org/) |
| **Docker** | 20.10.0 | [docker.com](https://www.docker.com/products/docker-desktop) |
| **Docker Compose** | 2.0.0 | Included with Docker Desktop |
| **Git** | 2.30.0 | [git-scm.com](https://git-scm.com/) |

**System Requirements:**
- RAM: 4GB minimum (8GB recommended)
- Disk: 5GB free space
- Ports: 3000, 5432, 6379, 5672, 15672, 8080

### Installation
```bash
# Clone repository
git clone https://github.com/shyamgit01/distributed-task-queue.git
cd distributed-task-queue

# Install API dependencies
cd api
npm install
cd ..

# Install Worker dependencies
cd worker
npm install
cd ..
```

### Running with Docker (Recommended)
```bash
# Start all services
docker-compose up -d

# Check status
docker-compose ps

# Wait for services to initialize (30-60 seconds)
sleep 45

# Verify health
curl http://localhost:3000/api/v1/health

# Expected response:
# {
#   "status": "ok",
#   "services": {
#     "postgres": "healthy",
#     "redis": "healthy",
#     "rabbitmq": "healthy"
#   }
# }
```

**Access Services:**
- API: http://localhost:3000/api/v1
- Dashboard: http://localhost:8080
- RabbitMQ Management: http://localhost:15672 (admin/admin123)

### Running Locally (Development)

**Step 1: Start Infrastructure**
```bash
# Start PostgreSQL, Redis, RabbitMQ
docker-compose up -d postgres redis rabbitmq

# Initialize database
docker exec -i taskqueue-postgres psql -U admin -d taskqueue < scripts/init-db.sql
```

**Step 2: Start API**
```bash
cd api

# Create .env file
cat > .env << 'EOF'
NODE_ENV=development
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=taskqueue
DB_USER=admin
DB_PASSWORD=admin123
REDIS_HOST=localhost
REDIS_PORT=6379
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_USER=admin
RABBITMQ_PASSWORD=admin123
RATE_LIMIT_WINDOW=3600
RATE_LIMIT_MAX_REQUESTS=1000
EOF

# Start API
npm run dev
```

**Step 3: Start Worker (new terminal)**
```bash
cd worker

# Create .env file
cat > .env << 'EOF'
NODE_ENV=development
WORKER_ID=worker-1
DB_HOST=localhost
DB_PORT=5432
DB_NAME=taskqueue
DB_USER=admin
DB_PASSWORD=admin123
REDIS_HOST=localhost
REDIS_PORT=6379
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_USER=admin
RABBITMQ_PASSWORD=admin123
WORKER_CONCURRENCY=5
PREFETCH_COUNT=1
EOF

# Start worker
npm run dev
```

**Step 4: Start Dashboard (new terminal)**
```bash
cd dashboard
npx http-server -p 8080
```

---

## 📝 API Documentation

### Create Task
```bash
POST /api/v1/tasks
Content-Type: application/json

{
  "type": "email_send",
  "priority": "high",
  "payload": {
    "to": "user@example.com",
    "subject": "Welcome!",
    "body": "Thanks for signing up"
  },
  "maxRetries": 3,
  "scheduledAt": "2025-11-23T10:00:00Z"  // Optional
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "type": "email_send",
    "priority": "high",
    "status": "pending",
    "created_at": "2025-11-22T08:00:00Z"
  },
  "message": "Task created successfully"
}
```

### Get Task Status
```bash
GET /api/v1/tasks/{taskId}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-...",
    "type": "email_send",
    "status": "completed",
    "result": {
      "success": true,
      "messageId": "msg-1234567890"
    },
    "created_at": "2025-11-22T08:00:00Z",
    "completed_at": "2025-11-22T08:00:05Z"
  }
}
```

### List Tasks
```bash
GET /api/v1/tasks?status=pending&priority=high&limit=50
```

### Cancel Task
```bash
DELETE /api/v1/tasks/{taskId}
```

### Retry Failed Task
```bash
POST /api/v1/tasks/{taskId}/retry
```

### Get Metrics
```bash
GET /api/v1/metrics
```

**Response:**
```json
{
  "success": true,
  "data": {
    "taskStats": [
      {"status": "completed", "priority": "high", "count": 1523},
      {"status": "pending", "priority": "medium", "count": 45}
    ],
    "queueStats": {
      "high": {"submitted": 2000, "completed": 1950}
    },
    "totalTasks": 10000
  }
}
```

### Quick Examples

**Send Email (High Priority):**
```bash
curl -X POST http://localhost:3000/api/v1/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "type": "email_send",
    "priority": "high",
    "payload": {
      "to": "test@example.com",
      "subject": "Test",
      "body": "Hello!"
    }
  }'
```

**Process Image (Medium Priority):**
```bash
curl -X POST http://localhost:3000/api/v1/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "type": "image_process",
    "priority": "medium",
    "payload": {
      "imageUrl": "https://example.com/photo.jpg",
      "operations": ["resize", "compress"]
    }
  }'
```

**Export Data (Low Priority):**
```bash
curl -X POST http://localhost:3000/api/v1/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "type": "data_export",
    "priority": "low",
    "payload": {
      "exportType": "monthly_report",
      "month": "November"
    }
  }'
```

---

## 📊 Monitoring

### Real-time Dashboard

**Access:** http://localhost:8080

**Features:**
- 📈 Total tasks processed
- ⏳ Tasks by status (pending, processing, completed, failed)
- 🎯 Tasks by priority
- 📋 Recent task history
- 🔄 Auto-refresh every 10 seconds

### RabbitMQ Management UI

**Access:** http://localhost:15672
- Username: `admin`
- Password: `admin123`

**Monitor:**
- Queue depths and message rates
- Worker connections
- Message throughput

### Database Monitoring
```bash
# Connect to database
docker exec -it taskqueue-postgres psql -U admin -d taskqueue

# Task distribution
SELECT status, priority, COUNT(*) 
FROM tasks 
GROUP BY status, priority;

# Average execution time
SELECT type, AVG(execution_time_ms) as avg_ms
FROM task_executions
WHERE status = 'completed'
GROUP BY type;

# Failed tasks
SELECT id, type, error_message, retry_count
FROM tasks
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 10;
```

### Redis Monitoring
```bash
# Connect to Redis
docker exec -it taskqueue-redis redis-cli

# Check active workers
SMEMBERS workers:active

# Check metrics
GET metrics:tasks:total
GET metrics:tasks:completed:email_send

# Check worker status
GET worker:worker-1:status
```

### Logs
```bash
# View all logs
docker-compose logs -f

# View API logs only
docker-compose logs -f api

# View worker logs
docker-compose logs -f worker-1 worker-2

# Last 100 lines
docker-compose logs --tail=100 api
```

---

## 🧪 Testing

### Quick Test
```bash
# Make script executable
chmod +x scripts/test-tasks.sh

# Run test
./scripts/test-tasks.sh

# Check results
curl http://localhost:3000/api/v1/tasks | jq
```

### Load Testing
```bash
# Make script executable
chmod +x scripts/load-test.sh

# Run load test (creates 1000 tasks)
./scripts/load-test.sh

# Monitor workers
docker-compose logs -f worker-1 worker-2

# Watch metrics
watch -n 2 'curl -s http://localhost:3000/api/v1/metrics | jq ".data.taskStats"'
```

### Manual Testing

**Test Priority Ordering:**
```bash
# Create tasks with different priorities
curl -X POST http://localhost:3000/api/v1/tasks \
  -H "Content-Type: application/json" \
  -d '{"type":"email_send","priority":"low","payload":{"to":"low@test.com","subject":"Low","body":"Test"}}'

curl -X POST http://localhost:3000/api/v1/tasks \
  -H "Content-Type: application/json" \
  -d '{"type":"email_send","priority":"high","payload":{"to":"high@test.com","subject":"High","body":"Test"}}'

# High priority should process first
docker-compose logs worker-1 | grep "Processing task"
```

**Test Task Cancellation:**
```bash
# Create task
RESPONSE=$(curl -s -X POST http://localhost:3000/api/v1/tasks \
  -H "Content-Type: application/json" \
  -d '{"type":"data_export","priority":"low","payload":{"exportType":"report"}}')

# Extract task ID
TASK_ID=$(echo $RESPONSE | jq -r '.data.id')

# Cancel it
curl -X DELETE http://localhost:3000/api/v1/tasks/$TASK_ID

# Verify
curl http://localhost:3000/api/v1/tasks/$TASK_ID | jq '.data.status'
```

---

## 📁 Project Structure
```
distributed-task-queue/
├── api/                          # API Service
│   ├── src/
│   │   ├── config/              # Database, Redis, RabbitMQ connections
│   │   ├── controllers/         # Request handlers
│   │   ├── services/            # Business logic
│   │   ├── middleware/          # Rate limiter, validation
│   │   ├── routes/              # API routes
│   │   └── app.js               # Express app entry
│   ├── logs/
│   ├── .env
│   ├── Dockerfile
│   └── package.json
│
├── worker/                       # Worker Service
│   ├── src/
│   │   ├── config/              # Configurations
│   │   ├── handlers/            # Task handlers (email, image, export)
│   │   ├── services/            # Worker service logic
│   │   └── worker.js            # Worker entry point
│   ├── logs/
│   ├── .env
│   ├── Dockerfile
│   └── package.json
│
├── dashboard/                    # Monitoring Dashboard
│   └── index.html               # Real-time dashboard
│
├── scripts/                      # Utility scripts
│   ├── init-db.sql              # Database schema
│   ├── test-tasks.sh            # Quick test
│   └── load-test.sh             # Load testing
│
├── docker-compose.yml            # Docker orchestration
├── .gitignore
├── LICENSE
└── README.md
```

---

## 💡 Use Cases

### E-commerce Order Processing
```javascript
// When user places order
await createTask({
  type: 'payment_process',
  priority: 'high',
  payload: { orderId, amount: 99.99 }
});

await createTask({
  type: 'email_send',
  priority: 'medium',
  payload: { to: customer.email, template: 'order_confirmation' }
});

await createTask({
  type: 'analytics_track',
  priority: 'low',
  payload: { event: 'order_placed', orderId }
});
```

### Social Media Video Upload
```javascript
// When user uploads video
await createTask({
  type: 'video_transcode',
  priority: 'medium',
  payload: {
    videoId,
    formats: ['1080p', '720p', '480p']
  }
});

await createTask({
  type: 'thumbnail_generate',
  priority: 'medium',
  payload: { videoId }
});
```

### Marketing Email Campaign
```javascript
// Send to 100,000 subscribers
const batches = chunkArray(subscribers, 100);

for (const batch of batches) {
  await createTask({
    type: 'email_batch_send',
    priority: 'low',
    payload: {
      campaignId,
      recipients: batch,
      template: 'newsletter'
    }
  });
}
```

---

## 🔍 Troubleshooting

### Services Won't Start
```bash
# Check logs
docker-compose logs postgres
docker-compose logs api

# Check ports
sudo lsof -i :5432  # PostgreSQL
sudo lsof -i :6379  # Redis
sudo lsof -i :3000  # API

# Clean restart
docker-compose down -v
docker-compose up -d
```

### Workers Not Processing
```bash
# Check worker registration
docker exec -it taskqueue-redis redis-cli SMEMBERS workers:active

# Check queue status
docker exec -it taskqueue-rabbitmq rabbitmqctl list_queues

# Restart workers
docker-compose restart worker-1 worker-2

# Check logs
docker-compose logs --tail=50 worker-1
```

### Database Connection Errors
```bash
# Check PostgreSQL
docker exec -it taskqueue-postgres pg_isready -U admin

# Re-run migrations
docker exec -i taskqueue-postgres psql -U admin -d taskqueue < scripts/init-db.sql

# Check tables
docker exec -it taskqueue-postgres psql -U admin -d taskqueue -c "\dt"
```

### Tasks Stuck in Processing
```bash
# Find stuck tasks
docker exec -it taskqueue-postgres psql -U admin -d taskqueue -c "
SELECT id, type, started_at, NOW() - started_at as duration
FROM tasks
WHERE status = 'processing'
AND started_at < NOW() - INTERVAL '5 minutes';"

# Reset stuck tasks (use with caution)
docker exec -it taskqueue-postgres psql -U admin -d taskqueue -c "
UPDATE tasks
SET status = 'pending', started_at = NULL
WHERE status = 'processing'
AND started_at < NOW() - INTERVAL '10 minutes';"
```

### High Memory Usage
```bash
# Check memory usage
docker stats

# Reduce worker concurrency
# In worker/.env:
WORKER_CONCURRENCY=2

# Clean up Docker
docker system prune -a --volumes
```

---

## 🚀 Scaling

### Scale Workers
```bash
# Scale to 5 workers
docker-compose up -d --scale worker=5

# Verify
docker-compose ps | grep worker

# Check in Redis
docker exec -it taskqueue-redis redis-cli SMEMBERS workers:active
```

### Production Deployment Checklist

- [ ] Change all default passwords
- [ ] Enable SSL/TLS for all connections
- [ ] Implement API authentication
- [ ] Set up monitoring and alerting
- [ ] Configure automated backups
- [ ] Enable log aggregation
- [ ] Set resource limits
- [ ] Configure auto-scaling policies
- [ ] Set up load balancer
- [ ] Enable health checks

---

## 🤝 Contributing

Contributions welcome! Please follow these steps:

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

### Areas to Contribute

- 🐛 Bug fixes
- ✨ New task handlers
- 📚 Documentation improvements
- 🧪 Test coverage
- 🎨 Dashboard enhancements
- ⚡ Performance optimizations

---

## 📄 License

This project is licensed under the MIT License.
```
MIT License

Copyright (c) 2025 Shyama Sundar Swain

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 👨‍💻 Author

**Shyama Sundar Swain**

- GitHub: [@shyamgit01](https://github.com/shyamgit01)
- LinkedIn: [Shyama Sundar Swain](https://www.linkedin.com/in/shyama-sundar-swain-64a4b8100/)
- Email: shyamasundars43@gmail.com

---

## 🙏 Acknowledgments

- Built with Node.js, RabbitMQ, PostgreSQL, and Redis
- Inspired by Celery, Bull, and Sidekiq
- Thanks to the open-source community

---

## 📚 Resources

- [Node.js Documentation](https://nodejs.org/docs/)
- [RabbitMQ Tutorials](https://www.rabbitmq.com/getstarted.html)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Redis Documentation](https://redis.io/documentation)
- [Docker Documentation](https://docs.docker.com/)

---

## 📞 Support

- 💬 Issues: [GitHub Issues](https://github.com/yourusername/distributed-task-queue/issues)
- 📖 Wiki: [Project Wiki](https://github.com/yourusername/distributed-task-queue/wiki)
- 💡 Discussions: [GitHub Discussions](https://github.com/yourusername/distributed-task-queue/discussions)

---

<div align="center">

**⭐ Star this repo if you find it helpful!**

Made with ❤️ by Shyama Sundar Swain

[⬆ Back to Top](#distributed-task-queue-system)

</div>