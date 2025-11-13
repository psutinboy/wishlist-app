# Wishlist App

A privacy-focused wishlist web application where users can create gift lists, add items by pasting URLs (with automatic metadata fetching), and share public links for others to claim items. Built with Angular and Vercel serverless functions.

## Features

### Core Features
- **User Authentication**: Secure signup/login with JWT tokens stored in HttpOnly cookies
- **List Management**: Create, edit, delete, and share wishlists
- **URL Preview**: Paste any product URL and automatically fetch title, image, and price via Open Graph tags
- **Item Organization**: Categorize items, set priorities (high/medium/low), add notes
- **Public Sharing**: Share lists via unique, URL-safe share links
- **Claim System**: Public users can claim items anonymously with secret tokens for unclaiming
- **Data Export**: Download all your data as JSON
- **Account Management**: Update email/password, manage preferences, delete account

### Security Features
- JWT authentication with bcrypt password hashing
- HttpOnly, Secure, SameSite cookies
- Rate limiting on all endpoints
- Input validation with Zod
- HTTPS-only URLs for external resources
- SSRF protection on URL preview
- No sensitive data in error messages
- Security headers (CSP, X-Frame-Options, etc.)

## Tech Stack

### Frontend
- **Angular 20** with standalone components
- **Signals** for state management
- **Reactive Forms** for form handling
- **RxJS** for async operations
- **TypeScript** with strict mode

### Backend
- **Vercel Serverless Functions** (Node.js)
- **MongoDB Atlas** with native driver
- **JWT** for authentication
- **bcrypt** for password hashing
- **Zod** for validation
- **nanoid** for unique ID generation

## Project Structure

```
wishlist-app/
├── src/
│   ├── app/
│   │   ├── guards/          # Route guards (auth)
│   │   ├── services/        # API services with signals
│   │   ├── pages/           # Page components
│   │   │   ├── login/
│   │   │   ├── signup/
│   │   │   ├── dashboard/
│   │   │   ├── list-detail/
│   │   │   ├── public-list/
│   │   │   └── settings/
│   │   ├── app.config.ts
│   │   └── app.routes.ts
│   └── styles.css
├── api/                     # Vercel serverless functions
│   ├── _db.js              # MongoDB connection
│   ├── _middleware/         # Auth, rate limiting
│   ├── _utils/             # Validation, security
│   ├── auth/               # Authentication endpoints
│   ├── lists/              # List management endpoints
│   ├── items/              # Item management endpoints
│   ├── claims/             # Claim endpoints (public)
│   └── users/              # User settings endpoints
├── vercel.json             # Vercel configuration
└── package.json
```

## Setup Instructions

### Prerequisites
- Node.js 18+ and npm
- MongoDB Atlas account (free tier works)
- Vercel account (for deployment)

### Local Development

1. **Clone the repository**
```bash
git clone <repository-url>
cd wishlist-app
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**

Create a `.env` file in the project root (already in `.gitignore`):

```env
# MongoDB
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/
MONGODB_DB_NAME=wishlist

# JWT Authentication (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
JWT_SECRET=your-super-secret-min-32-chars-random-string-here
JWT_EXPIRES_IN=7d

# Environment
NODE_ENV=development

# CORS (for local dev)
ALLOWED_ORIGINS=http://localhost:4200

# Rate Limiting (optional)
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

4. **Initialize database indexes**
```bash
node api/init-db.js
```

5. **Start development server**
```bash
npm start
```

The app will be available at `http://localhost:4200/`

### Building for Production

```bash
npm run build
```

Build artifacts will be in `dist/wishlist-app/browser/`

## Deployment to Vercel

1. **Install Vercel CLI**
```bash
npm install -g vercel
```

2. **Login to Vercel**
```bash
vercel login
```

3. **Deploy**
```bash
vercel
```

4. **Configure Environment Variables in Vercel Dashboard**
   - Go to your project settings
   - Add all environment variables from `.env`
   - Mark `MONGODB_URI` and `JWT_SECRET` as sensitive

5. **Production deployment**
```bash
vercel --prod
```

## API Endpoints

### Authentication (POST)
- `POST /api/auth/signup` - Create new account
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user

### Lists (Authenticated)
- `GET /api/lists` - Get all user's lists
- `POST /api/lists/create` - Create new list
- `GET /api/lists/:id` - Get list with items
- `PATCH /api/lists/:id` - Update list
- `DELETE /api/lists/:id` - Delete list (cascades to items/claims)

### Public Share
- `GET /api/lists/share/:shareId` - Get public list (no auth)

### Items (Authenticated)
- `GET /api/items?listId=x` - Get items for list
- `POST /api/items/create` - Create item
- `PATCH /api/items/:id` - Update item
- `DELETE /api/items/:id` - Delete item
- `POST /api/items/preview` - Preview URL metadata

### Claims (Public)
- `POST /api/claims/create` - Claim item (returns secret token)
- `DELETE /api/claims/:id?token=x` - Unclaim item with token

### User Settings (Authenticated)
- `PATCH /api/users/settings` - Update settings
- `GET /api/users/export` - Export all data
- `DELETE /api/users/delete` - Delete account

## Database Schema

### Users Collection
```javascript
{
  _id: ObjectId,
  email: String (unique, indexed),
  passwordHash: String,
  displayName: String,
  preferences: {
    defaultListVisibility: Boolean,
    theme: 'light' | 'dark' | 'system',
    allowClaimsByDefault: Boolean
  },
  createdAt: Date,
  updatedAt: Date
}
```

### Lists Collection
```javascript
{
  _id: ObjectId,
  ownerId: String (indexed),
  title: String,
  isPublic: Boolean,
  shareId: String (unique, indexed, URL-safe),
  createdAt: Date,
  updatedAt: Date
}
```

### Items Collection
```javascript
{
  _id: ObjectId,
  listId: String (indexed),
  title: String,
  url: String (HTTPS only),
  price: Number (in cents),
  imageUrl: String,
  category: String,
  priority: 'high' | 'medium' | 'low',
  notes: String,
  createdAt: Date,
  updatedAt: Date
}
```

### Claims Collection
```javascript
{
  _id: ObjectId,
  itemId: String (indexed),
  claimerName: String,
  claimerNote: String,
  secretToken: String (unique, indexed),
  claimedAt: Date
}
```

## Security Best Practices

1. **Never commit `.env` files** - Already in `.gitignore`
2. **Use strong JWT secrets** - Generate with crypto.randomBytes
3. **HTTPS only** - All external URLs must use HTTPS
4. **Rate limiting** - Applied to all endpoints
5. **Input validation** - Zod schemas on all inputs
6. **Password hashing** - bcrypt with 12 salt rounds
7. **Secure cookies** - HttpOnly, Secure (in production), SameSite
8. **Generic errors** - Never expose sensitive info in error messages

## Development Guidelines

### Angular Best Practices
- Use standalone components (no NgModules)
- Use signals for state management
- Use `input()` and `output()` functions
- Set `changeDetection: OnPush` on all components
- Use native control flow (`@if`, `@for`, `@switch`)
- Use `inject()` function instead of constructor injection

### Code Style
- TypeScript strict mode enabled
- Prettier configured for formatting
- Use async/await for promises
- Handle errors appropriately

## Troubleshooting

### MongoDB Connection Issues
- Verify `MONGODB_URI` is correct
- Check IP whitelist in MongoDB Atlas
- Ensure database user has proper permissions

### Authentication Issues
- Clear browser cookies
- Check `JWT_SECRET` is set
- Verify cookies are being sent (check browser DevTools)

### Rate Limiting
- Rate limits are per-IP for public endpoints
- Per-user for authenticated endpoints
- Limits: 5 req/15min for auth, 10 req/min for preview, 100 req/15min general

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - See LICENSE file for details

## Support

For issues, questions, or feature requests, please contact support@wishlist-app.com or open an issue on GitHub.
