-- scripts/init-db.sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(50) NOT NULL,
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
    payload JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'retrying')),
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    created_at TIMESTAMP DEFAULT NOW(),
    scheduled_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    result JSONB
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_scheduled_at ON tasks(scheduled_at) WHERE scheduled_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_status_priority ON tasks(status, priority, created_at DESC);

-- Task executions history
CREATE TABLE IF NOT EXISTS task_executions (
    id SERIAL PRIMARY KEY,
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    worker_id VARCHAR(100) NOT NULL,
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    status VARCHAR(20) NOT NULL,
    error_message TEXT,
    execution_time_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_executions_task_id ON task_executions(task_id);
CREATE INDEX IF NOT EXISTS idx_executions_worker_id ON task_executions(worker_id);

-- Rate limiting table
CREATE TABLE IF NOT EXISTS rate_limits (
    client_id VARCHAR(100) PRIMARY KEY,
    request_count INTEGER DEFAULT 0,
    window_start TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start);