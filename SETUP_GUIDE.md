# Wishlist App - Setup Guide

## 🎉 Migration Complete!

Your Wishlist App has been successfully migrated to Express.js with local development support while maintaining Vercel deployment compatibility.

## 📁 New Structure

```
wishlist-app/
├── backend/                 # Express backend (NEW)
│   ├── api/
│   │   ├── routes/         # Express route handlers
│   │   ├── middleware/     # Auth & rate limiting
│   │   └── utils/          # DB, security, validation
│   ├── server.js           # Express app
│   ├── api.js              # Vercel wrapper
│   ├── package.json
│   ├── .env.example
│   └── README.md
├── src/
│   ├── environments/       # Environment configs (NEW)
│   │   ├── environment.ts       # Dev: localhost:3000
│   │   └── environment.prod.ts  # Prod: /api
│   └── app/...
├── api/                    # OLD serverless (can delete after testing)
└── package.json            # Updated with new scripts
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
# From root directory
npm install                  # Frontend dependencies
npm run backend:install      # Backend dependencies
```

### 2. Configure Backend

```bash
# Create backend environment file
cd backend
cp .env.example .env
```

Edit `backend/.env`:

``` env
MONGODB_URI=mongodb+srv://your-username:your-password@cluster.mongodb.net/
MONGODB_DB_NAME=wishlist
JWT_SECRET=<generate-with-command-below>
JWT_EXPIRES_IN=7d
PORT=3000
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:4200
```

Generate JWT Secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Initialize Database (First Time Only)

```bash
cd backend
node init-db.js
```

This creates the required MongoDB indexes.

### 4. Run Development Servers

**Option A: Both servers at once (Recommended)**
```bash
# From root directory
npm run dev
```
- Backend: http://localhost:3000/api
- Frontend: http://localhost:4200

**Option B: Run separately**
```bash
# Terminal 1: Backend
npm run dev:backend

# Terminal 2: Frontend
npm run dev:frontend
```

## 📝 Available Scripts

From root directory:

- `npm run dev` - Run both frontend and backend
- `npm run dev:frontend` - Run Angular only
- `npm run dev:backend` - Run Express backend only
- `npm run backend:install` - Install backend dependencies
- `npm start` - Run Angular dev server
- `npm run build` - Build for production

## 🧪 Testing Locally

Test these features to verify everything works:

1. **Authentication**
   - Signup at http://localhost:4200/signup
   - Login with created account
   - Verify you're redirected to dashboard

2. **Lists**
   - Create a new list
   - Edit list title
   - Toggle public/private
   - Delete a list

3. **Items**
   - Add item with URL preview (try Amazon, etc.)
   - Add item manually
   - Edit item details
   - Delete item

4. **Public Sharing**
   - Make a list public
   - Copy share link
   - Open in incognito/different browser
   - Verify public can see items

5. **Claims**
   - From public view, claim an item
   - Save the secret token
   - Unclaim using the token

6. **Settings**
   - Update email
   - Change password
   - Update display name
   - Export data
   - (Don't test delete account unless you want to!)

## 🌐 Deploying to Vercel

### First Time Setup

1. **Push to Git**
   ```bash
   git add .
   git commit -m "Migrate to Express backend"
   git push
   ```

2. **Connect to Vercel**
   - Go to https://vercel.com
   - Import your repository
   - Vercel auto-detects the configuration

3. **Add Environment Variables**
   
   In Vercel Dashboard → Settings → Environment Variables:
   
   | Variable | Value | Example |
   |----------|-------|---------|
   | `MONGODB_URI` | Your MongoDB connection string | `mongodb+srv://...` |
   | `MONGODB_DB_NAME` | Database name | `wishlist` |
   | `JWT_SECRET` | Secret key (32+ chars) | Generate with crypto |
   | `JWT_EXPIRES_IN` | Token expiration | `7d` |
   | `NODE_ENV` | Environment | `production` |

4. **Deploy**
   - Click "Deploy"
   - Vercel will build and deploy automatically
   - Access your app at `your-app.vercel.app`

### Subsequent Deployments

Just push to your Git repository:
```bash
git push
```
Vercel automatically redeploys on push!

## 🔍 Troubleshooting

### CORS Errors (Local Development)

**Symptom:** Frontend can't reach backend, CORS errors in console

**Solution:**
- Check `backend/.env` has `NODE_ENV=development`
- Verify `ALLOWED_ORIGINS=http://localhost:4200`
- Restart backend server

### Database Connection Errors

**Symptom:** "Failed to connect to MongoDB"

**Solution:**
- Verify `MONGODB_URI` in `backend/.env`
- Check your MongoDB Atlas:
  - IP whitelist includes your IP (or use `0.0.0.0/0` for all)
  - Database user has correct permissions
  - Connection string includes password

### Backend Not Starting

**Symptom:** "Cannot find module..." or other errors

**Solution:**
```bash
cd backend
rm -rf node_modules
npm install
```

### Frontend Can't Connect

**Symptom:** API calls failing, 404 errors

**Solution:**
- Verify backend is running on port 3000
- Check browser console for actual error
- Ensure Angular is using dev environment (not prod)

### Vercel Deployment Issues

**Symptom:** Build fails or endpoints return 404

**Solution:**
- Check Vercel build logs for specific errors
- Verify ALL environment variables are set
- Make sure `backend:install` script ran during build
- Check Functions tab in Vercel dashboard

### JWT Errors

**Symptom:** "Invalid token" or authentication errors

**Solution:**
- Make sure `JWT_SECRET` is the same in local and Vercel
- Clear browser cookies
- Re-login

## 📚 API Documentation

All endpoints remain at `/api/*`:

### Authentication
- `POST /api/auth/signup` - Create account
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user

### Lists  
- `GET /api/lists` - Get user's lists
- `POST /api/lists` - Create list
- `GET /api/lists/:id` - Get list with items
- `PATCH /api/lists/:id` - Update list
- `DELETE /api/lists/:id` - Delete list
- `GET /api/lists/share/:shareId` - Public list view

### Items
- `GET /api/items?listId=xxx` - Get items
- `POST /api/items` - Create item
- `POST /api/items/preview` - Preview URL
- `PATCH /api/items/:id` - Update item
- `DELETE /api/items/:id` - Delete item

### Claims (Public)
- `POST /api/claims` - Claim item
- `DELETE /api/claims/:id?token=xxx` - Unclaim

### User Settings
- `PATCH /api/users/settings` - Update settings
- `GET /api/users/export` - Export data
- `DELETE /api/users/delete` - Delete account

## 🧹 Cleanup (After Testing)

Once you've verified everything works locally and on Vercel:

```bash
# Delete old serverless functions directory
rm -rf api/

# Commit the cleanup
git add .
git commit -m "Remove old serverless functions"
git push
```

## 💡 Tips

1. **Development Workflow**
   - Keep both servers running with `npm run dev`
   - Backend auto-restarts on changes (if using nodemon)
   - Frontend hot-reloads automatically

2. **MongoDB Atlas**
   - Use free M0 tier (sufficient for most apps)
   - Whitelist `0.0.0.0/0` for easier development
   - Create separate databases for dev/prod

3. **Environment Variables**
   - Never commit `.env` files
   - Use different secrets for dev/prod
   - Document all required vars in `.env.example`

4. **Security**
   - Always use HTTPS URLs for external resources
   - Keep JWT_SECRET secure and random
   - Use strong passwords in MongoDB

## 📖 Additional Documentation

- `backend/README.md` - Backend-specific documentation
- `MIGRATION_NOTES.md` - Migration details and architecture
- `info.txt` - Original project requirements
- `README.md` - Main project README

## 🎯 What's Next?

Your app is ready! You can now:
- ✅ Develop locally with hot reload
- ✅ Test all features end-to-end  
- ✅ Deploy to Vercel seamlessly
- ✅ Scale with confidence

Happy coding! 🚀

