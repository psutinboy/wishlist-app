# Wishlist App - Express Backend

Node.js/Express backend for the Wishlist application with MongoDB.

## Quick Start

### Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create `.env` file:**
   ```bash
   cp .env.example .env
   ```
   Then edit `.env` with your MongoDB credentials and JWT secret.

3. **Generate JWT Secret:**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

4. **Start the server:**
   ```bash
   npm run dev
   ```
   Server will run on http://localhost:3000

5. **Initialize database indexes (first time only):**
   ```bash
   node init-db.js
   ```

### Run with Frontend

From the root directory:
```bash
npm run dev
```
This runs both backend (port 3000) and frontend (port 4200) concurrently.

## Project Structure

```
backend/
├── api/
│   ├── routes/          # Express route handlers
│   │   ├── auth.routes.js
│   │   ├── lists.routes.js
│   │   ├── items.routes.js
│   │   ├── claims.routes.js
│   │   └── users.routes.js
│   ├── middleware/      # Express middleware
│   │   ├── auth.js      # JWT verification
│   │   └── rateLimit.js # Rate limiting
│   └── utils/           # Utility functions
│       ├── db.js        # MongoDB connection
│       ├── security.js  # Security helpers
│       └── validation.js # Zod schemas
├── server.js            # Express app
├── api.js               # Vercel wrapper
├── package.json
└── .env.example
```

## API Endpoints

### Authentication
- `POST /api/auth/signup` - Create account
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user

### Lists
- `GET /api/lists` - Get user's lists
- `POST /api/lists` - Create list
- `GET /api/lists/:id` - Get list details
- `PATCH /api/lists/:id` - Update list
- `DELETE /api/lists/:id` - Delete list
- `GET /api/lists/share/:shareId` - Public list view

### Items
- `GET /api/items?listId=xxx` - Get items for list
- `POST /api/items` - Create item
- `POST /api/items/preview` - Preview URL metadata (powered by Microlink)
- `PATCH /api/items/:id` - Update item
- `DELETE /api/items/:id` - Delete item

### Claims (Public)
- `POST /api/claims` - Claim item
- `DELETE /api/claims/:id?token=xxx` - Unclaim item

### User Settings
- `PATCH /api/users/settings` - Update settings
- `GET /api/users/export` - Export data
- `DELETE /api/users/delete` - Delete account

## Environment Variables

Required environment variables (see `.env.example`):

- `MONGODB_URI` - MongoDB connection string
- `MONGODB_DB_NAME` - Database name (default: wishlist)
- `JWT_SECRET` - Secret for JWT tokens (min 32 chars)
- `JWT_EXPIRES_IN` - Token expiration (default: 7d)
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)
- `ALLOWED_ORIGINS` - CORS origins for development

Optional environment variables:

- `MICROLINK_API_KEY` - Microlink API key for enhanced URL preview (optional)
  - Free tier: 50,000 requests/month without key
  - Sign up at https://microlink.io for usage tracking and higher limits
  - The preview feature works without this key using the free tier

## Deployment

### Vercel

The backend is configured to work with Vercel serverless functions.

1. Push to your Git repository
2. Connect repository to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

Vercel will automatically:
- Install dependencies
- Build the frontend
- Deploy the Express backend as serverless functions

## Features

### URL Preview with Microlink

The `/api/items/preview` endpoint uses **Microlink** for intelligent metadata extraction:

- **50,000 free requests/month** (no API key required)
- Handles JavaScript-rendered content (React, Vue, etc.)
- Bypasses bot detection on major e-commerce sites
- Extracts: title, image, price, category, and description
- **Automatic fallback**: If Microlink fails, uses local HTML scraping
- Works with: Amazon, eBay, Shopify, WooCommerce, and most online stores

The endpoint automatically tries Microlink first and falls back to local scraping if needed.

## Security Features

- JWT authentication with HttpOnly cookies
- bcrypt password hashing (12 rounds)
- Rate limiting on all endpoints
- Zod input validation
- HTTPS-only URLs
- SSRF protection
- XSS protection
- Security headers (CSP, X-Frame-Options, etc.)

## Development Tips

- Use `npm run dev` for hot-reload development
- Backend logs all requests in development mode
- CORS is enabled only in development
- Rate limits are applied per-IP and per-user

