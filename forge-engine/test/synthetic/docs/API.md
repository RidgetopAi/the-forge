# User Management API

Base URL: `https://api.example.com/v1`

## Authentication

All endpoints require a Bearer token in the Authorization header:

```
Authorization: Bearer <token>
```

## Endpoints

### GET /users

List all users with optional filtering.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| page | integer | No | Page number (default: 1) |
| limit | integer | No | Items per page (default: 20, max: 100) |
| role | string | No | Filter by role: admin, user, guest |
| status | string | No | Filter by status: active, inactive |

**Response:**
```json
{
  "data": [
    {
      "id": "user_123",
      "email": "john@example.com",
      "name": "John Doe",
      "role": "user",
      "status": "active",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

**Status Codes:**
- 200: Success
- 401: Unauthorized
- 403: Forbidden

---

### GET /users/:id

Get a single user by ID.

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | User ID |

**Response:**
```json
{
  "data": {
    "id": "user_123",
    "email": "john@example.com",
    "name": "John Doe",
    "role": "user",
    "status": "active",
    "profile": {
      "avatar": "https://cdn.example.com/avatars/123.jpg",
      "bio": "Software developer",
      "timezone": "America/New_York"
    },
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-02-01T14:22:00Z"
  }
}
```

**Status Codes:**
- 200: Success
- 401: Unauthorized
- 404: User not found

---

### POST /users

Create a new user.

**Request Body:**
```json
{
  "email": "jane@example.com",
  "name": "Jane Smith",
  "password": "securePassword123",
  "role": "user"
}
```

**Validation Rules:**
- email: Valid email format, unique
- name: 2-100 characters
- password: Min 8 chars, requires uppercase, lowercase, number
- role: One of: admin, user, guest

**Response:**
```json
{
  "data": {
    "id": "user_456",
    "email": "jane@example.com",
    "name": "Jane Smith",
    "role": "user",
    "status": "active",
    "createdAt": "2024-02-10T09:15:00Z"
  }
}
```

**Status Codes:**
- 201: Created
- 400: Validation error
- 401: Unauthorized
- 409: Email already exists

---

### PUT /users/:id

Update an existing user.

**Request Body:**
```json
{
  "name": "Jane Doe",
  "profile": {
    "bio": "Updated bio"
  }
}
```

**Response:**
```json
{
  "data": {
    "id": "user_456",
    "email": "jane@example.com",
    "name": "Jane Doe",
    "role": "user",
    "status": "active",
    "profile": {
      "bio": "Updated bio"
    },
    "updatedAt": "2024-02-10T12:00:00Z"
  }
}
```

**Status Codes:**
- 200: Success
- 400: Validation error
- 401: Unauthorized
- 403: Cannot update other users (unless admin)
- 404: User not found

---

### DELETE /users/:id

Delete a user (soft delete).

**Response:**
```json
{
  "message": "User deleted successfully"
}
```

**Status Codes:**
- 200: Success
- 401: Unauthorized
- 403: Cannot delete other users (unless admin)
- 404: User not found

---

## Error Responses

All errors follow this format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": {
      "email": ["Email format is invalid"],
      "password": ["Password must be at least 8 characters"]
    }
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| VALIDATION_ERROR | 400 | Request validation failed |
| UNAUTHORIZED | 401 | Missing or invalid token |
| FORBIDDEN | 403 | Insufficient permissions |
| NOT_FOUND | 404 | Resource not found |
| CONFLICT | 409 | Resource already exists |
| RATE_LIMITED | 429 | Too many requests |
| INTERNAL_ERROR | 500 | Server error |

## Rate Limiting

- 100 requests per minute per user
- 1000 requests per minute per IP (unauthenticated)

Rate limit headers:
- `X-RateLimit-Limit`: Request limit
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Unix timestamp of reset
