# Todo List API
A RESTful Todo List API with JWT-based authentication, built as a learning project to understand backend fundamentals.

## Tech Stack
- **Runtime**: Node.js v24
- **Framework**: Express.js (ES modules)
- **Database**: PostgreSQL
- **Auth**: JWT (access token) + refresh token rotation, bcrypt password hashing
- **Security**: `helmet`, `express-rate-limit`

## Features
- User registration and login
- Passwords hashed with bcrypt before storage
- Short-lived JWT access tokens (1 hour)
- Refresh tokens with rotation, each use invalidates the old token and issues a new one
- Logout endpoint that revokes a refresh token
- Full CRUD for todos, scoped to the user
- Ownership enforcement - users only have access to their own todos to update/delete
- Pagination for todos (shows total todos and total pages)
- Rate Limiting
- Security-related HTTP headers through `helmet`

## Setup
1. Clone the repo and install dependencies:
```
npm install 
```
2. Create a `.env`file in the project root:
```
PORT=4000
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/your_db_name?schema=public"
JWT_SECRET=your_random_secret_here
```

Generate a secret with:
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
3. Create the database in pgAdmin or through createdb, then run `db/init.sql` using pgAdmin's **Query Tool** or psql.
4. Start the server:
```
node server.js
```
Server runs on `http://localhost:4000` by default

## API Endpoints

### Auth

| Method | Route              | Description                                  | Auth required |
|--------|---------------------|-----------------------------------------------|----------------|
| POST   | `/auth/register`    | Create a new user                             | No             |
| POST   | `/auth/login`        | Log in, returns access + refresh token         | No             |
| POST   | `/auth/refresh`      | Exchange a refresh token for a new access token (rotates the refresh token) | No |
| POST   | `/auth/logout`       | Revoke a refresh token                        | No             |

### Todos

All todos routes require an `Authorization: Bearer <accessToken>` header.
 
| Method | Route          | Description                          |
|--------|----------------|---------------------------------------|
| GET    | `/todos`       | List the authenticated user's todos. Supports `?page=` and `?limit=` query params. |
| POST   | `/todos`       | Create a new todo                     |
| PUT    | `/todos/:id`   | Update a todo (must be owned by the requesting user) |
| DELETE | `/todos/:id`   | Delete a todo (must be owned by the requesting user) |

## Auth Flow Notes
 
- Access tokens expire after 1 hour. When a request to a protected route returns `401`, the client should call `/auth/refresh` with its stored refresh token to get a new access token, rather than forcing the user to log in again.
- Refresh tokens are rotated on every use — using a refresh token invalidates it and issues a new one. The old token cannot be reused.
- Refresh tokens expire after 7 days.
- Only the hash of a refresh token is stored in the database; the raw token is never persisted.