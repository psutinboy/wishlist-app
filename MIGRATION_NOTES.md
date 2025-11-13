# Migration to Express Backend - Complete

## What Changed

The application has been successfully migrated from Vercel serverless functions to an Express backend while maintaining Vercel deployment compatibility.

## Architecture

### Before
- Individual serverless functions in `/api` directory
- Direct Vercel serverless deployment

### After
- Express.js backend in `/backend` directory
- Organized routes, middleware, and utilities
- Dual-mode: Local Express server OR Vercel serverless
- Frontend uses environment-based API URLs

## File Structure

```
wishlist-app/
├── backend/                 # NEW: Express backend
│   ├── api/
│   │   ├── routes/         # Consolidated route handlers
│   │   ├── middleware/     # Auth & rate limiting
│   │   └── utils/          # DB, security, validation
│   ├── server.js           # Express app
│   ├── api.js              # Vercel wrapper
│   ├── package.json        # Backend dependencies
│   ├── .env.example        # Environment template
│   └── README.md           # Backend documentation
├── src/
│   └── environments/       # NEW: Environment configs
│       ├── environment.ts      # Dev: localhost:3000
│       └── environment.prod.ts # Prod: /api
├── api/                    # OLD: Can be deleted after testing
└── vercel.json             # Updated for Express
```

## Running Locally

### Option 1: Run Both Servers
```bash
# Install all dependencies
npm install
npm run backend:install

# Copy and configure backend .env
cd backend
cp .env.example .env
# Edit .env with your MongoDB credentials

# Run both servers (from root)
npm run dev
```
- Backend: http://localhost:3000/api
- Frontend: http://localhost:4200

### Option 2: Run Separately
```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
npm run start
```

## Deployment to Vercel

Everything works the same! Just push to your repository.

Vercel will:
1. Install dependencies (frontend and backend)
2. Build Angular frontend
3. Deploy Express backend as serverless functions
4. Route `/api/*` to Express backend

**Don't forget:** Add environment variables in Vercel dashboard:
- MONGODB_URI
- JWT_SECRET
- MONGODB_DB_NAME
- NODE_ENV=production

## Testing Checklist

Before deleting `/api` directory:

- [ ] Test signup and login locally
- [ ] Test creating and viewing lists
- [ ] Test adding items with URL preview
- [ ] Test public list sharing
- [ ] Test claims (claim/unclaim items)
- [ ] Test user settings update
- [ ] Test data export
- [ ] Test account deletion
- [ ] Deploy to Vercel and test production
- [ ] Verify all environment variables are set in Vercel

## Key Benefits

✅ Better code organization (routes, middleware, utils)
✅ Easier local development and debugging
✅ Standard Express patterns
✅ Same security and features as before
✅ Compatible with Vercel deployment
✅ Shared middleware and utilities

## API Endpoints

All endpoints remain the same:
- `/api/auth/*` - Authentication
- `/api/lists/*` - Lists management
- `/api/items/*` - Items management
- `/api/claims/*` - Public claims
- `/api/users/*` - User settings

## Next Steps

1. **Test locally** - Run `npm run dev` and test all features
2. **Initialize database** - Run `cd backend && node init-db.js` (first time only)
3. **Test on Vercel** - Push to Git and verify deployment
4. **Delete old code** - Once confirmed working, delete `/api` directory

## Troubleshooting

### CORS errors in local development
- Make sure `ALLOWED_ORIGINS` in backend/.env includes `http://localhost:4200`
- Verify `NODE_ENV=development` in backend/.env

### Database connection errors
- Check `MONGODB_URI` in backend/.env
- Verify your IP is whitelisted in MongoDB Atlas

### Frontend can't reach backend
- Check Angular is using correct environment (dev vs prod)
- Verify backend is running on port 3000

### Vercel deployment issues
- Ensure `backend:install` script runs in build command
- Verify environment variables are set in Vercel dashboard
- Check build logs for errors

## Support

For issues, refer to:
- `backend/README.md` - Backend documentation
- `info.txt` - Original project requirements
- This file - Migration details

