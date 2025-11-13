import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { connectToDatabase } from './api/utils/db.js';

// Load environment variables
dotenv.config();

// Import routes
import authRoutes from './api/routes/auth.routes.js';
import listsRoutes from './api/routes/lists.routes.js';
import itemsRoutes from './api/routes/items.routes.js';
import claimsRoutes from './api/routes/claims.routes.js';
import usersRoutes from './api/routes/users.routes.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "https:"],
      scriptSrc: ["'self'"]
    }
  },
  xFrameOptions: { action: 'deny' }
}));

// CORS configuration - only in development
if (process.env.NODE_ENV === 'development') {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:4300'];
  
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Request logging in development
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/lists', listsRoutes);
app.use('/api/items', itemsRoutes);
app.use('/api/claims', claimsRoutes);
app.use('/api/users', usersRoutes);

// 404 handler for API routes - catch any unmatched /api routes
app.use('/api', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    statusCode: 404
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  // Handle CORS errors
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      error: 'CORS policy violation',
      statusCode: 403
    });
  }
  
  // Handle JSON parsing errors
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: 'Invalid JSON in request body',
      statusCode: 400
    });
  }
  
  // Generic error response (don't leak details in production)
  const isDevelopment = process.env.NODE_ENV === 'development';
  res.status(err.statusCode || 500).json({
    error: err.message || 'Internal server error',
    statusCode: err.statusCode || 500,
    ...(isDevelopment && { stack: err.stack })
  });
});

// Connect to database and start server (only when not running as Vercel serverless)
if (process.env.VERCEL !== '1') {
  async function startServer() {
    try {
      // Test database connection
      await connectToDatabase();
      console.log('✓ Connected to MongoDB');
      
      app.listen(PORT, () => {
        console.log(`✓ Server running on http://localhost:${PORT}`);
        console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`✓ API endpoints available at http://localhost:${PORT}/api`);
      });
    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  startServer();

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully...');
    process.exit(0);
  });
}

// Export app for Vercel serverless
export default app;

