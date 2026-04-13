# Postman API Testing Guide (Evit API)

This guide explains how to test the Evit Backend API using Postman.

## 1. Setup
- **Base URL:** `http://localhost:3000/api/v1`
- **Headers:** All protected routes require `Authorization: Bearer <token>`

## 2. Health & Connections
No authentication required.

### Health Check
- **Method:** `GET`
- **URL:** `{{base_url}}/health`

### Deep Connection Diagnostic
- **Method:** `GET`
- **URL:** `{{base_url}}/debug/connections`
- **Checks:** PostgreSQL, Redis, and S3 status.

## 3. Authentication
### Login
- **Method:** `POST`
- **URL:** `{{base_url}}/auth/login`
- **Body (JSON):**
```json
{
  "mobile": "9884633223",
  "password": "your_password"
}
```

## 4. Profile Management
Requires Bearer Token.

### Get Profile
- **Method:** `GET`
- **URL:** `{{base_url}}/profile`

### Update Profile
- **Method:** `PUT`
- **URL:** `{{base_url}}/profile`
- **Body (JSON):**
```json
{
  "fullName": "Test User"
}
```
