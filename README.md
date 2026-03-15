# Distributed Background Job Processing System

A distributed task queue system for processing asynchronous workloads using:

- Node.js
- RabbitMQ
- Redis
- PostgreSQL
- Docker

This system allows applications to offload heavy tasks to background workers, improving API response times and system reliability.

## Architecture

Client → API → Queue → Workers → Database

## Features

- asynchronous task processing
- retry handling
- dead letter queue
- priority queues
- worker pool execution
- rate limiting
- task monitoring

## Tech Stack

Node.js  
RabbitMQ  
Redis  
PostgreSQL  
Docker
