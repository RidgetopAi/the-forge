# System Architecture

## Overview

The User Management System is a distributed application built on microservices principles. It handles user authentication, authorization, and profile management for the platform.

## High-Level Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Web Client    │     │  Mobile Client  │     │   Admin Panel   │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │      API Gateway        │
                    │   (Rate Limiting, Auth) │
                    └────────────┬────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌────────▼────────┐    ┌────────▼────────┐    ┌────────▼────────┐
│   User Service  │    │   Auth Service  │    │ Notification Svc│
│   (CRUD ops)    │    │   (JWT, OAuth)  │    │  (Email, Push)  │
└────────┬────────┘    └────────┬────────┘    └────────┬────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │      Message Queue      │
                    │        (Redis)          │
                    └────────────┬────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌────────▼────────┐    ┌────────▼────────┐    ┌────────▼────────┐
│   PostgreSQL    │    │      Redis      │    │   S3 Storage    │
│   (Primary DB)  │    │   (Cache/Queue) │    │    (Assets)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Core Components

### API Gateway

- **Technology**: Node.js with Express
- **Responsibilities**:
  - Request routing to appropriate microservices
  - Rate limiting (token bucket algorithm)
  - JWT validation and user context injection
  - Request/response logging
  - CORS handling

### User Service

- **Technology**: Node.js with TypeScript
- **Database**: PostgreSQL
- **Responsibilities**:
  - User CRUD operations
  - Profile management
  - Role assignment
  - User search and filtering

**Key Files:**
- `src/controllers/UserController.ts` - HTTP handlers
- `src/services/UserService.ts` - Business logic
- `src/repositories/UserRepository.ts` - Database access
- `src/models/User.ts` - Domain model

### Auth Service

- **Technology**: Node.js with TypeScript
- **Responsibilities**:
  - JWT generation and validation
  - OAuth 2.0 integration (Google, GitHub)
  - Password hashing (bcrypt)
  - Session management
  - Token refresh logic

**Security Measures:**
- Tokens expire after 15 minutes
- Refresh tokens valid for 7 days
- Rate limiting on login attempts
- Account lockout after 5 failed attempts

### Notification Service

- **Technology**: Node.js with TypeScript
- **Message Queue**: Redis
- **Responsibilities**:
  - Email notifications (SendGrid)
  - Push notifications (Firebase)
  - In-app notifications
  - Notification preferences

## Data Flow

### User Registration Flow

1. Client submits registration form
2. API Gateway validates request format
3. User Service validates business rules
4. Password hashed and user stored
5. Auth Service generates JWT
6. Notification Service sends welcome email
7. Response returned to client

### Authentication Flow

1. Client submits credentials
2. API Gateway rate-limits the request
3. Auth Service validates credentials
4. JWT generated with user claims
5. Token returned to client
6. Subsequent requests include JWT in header

## Database Schema

### users table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  role VARCHAR(20) DEFAULT 'user',
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### user_profiles table
```sql
CREATE TABLE user_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  avatar_url TEXT,
  bio TEXT,
  timezone VARCHAR(50),
  preferences JSONB DEFAULT '{}'
);
```

## Caching Strategy

- **User sessions**: Redis, 15-minute TTL
- **User profiles**: Redis, 5-minute TTL with cache-aside pattern
- **API responses**: CDN caching for public endpoints

## Deployment

- **Container**: Docker
- **Orchestration**: Kubernetes
- **CI/CD**: GitHub Actions
- **Monitoring**: Prometheus + Grafana
- **Logging**: ELK Stack

## Scaling Considerations

- User Service scales horizontally behind load balancer
- PostgreSQL uses read replicas for query distribution
- Redis cluster for high availability caching
- Event-driven architecture for async operations
