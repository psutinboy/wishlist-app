import express from 'express';
import bcrypt from 'bcrypt';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../utils/db.js';
import { validate, signupSchema, loginSchema } from '../utils/validation.js';
import { createErrorResponse, createSuccessResponse } from '../utils/security.js';
import { generateToken, requireAuth, getAuthCookieOptions, getLogoutCookieOptions } from '../middleware/auth.js';
import { authRateLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

// POST /api/auth/signup
router.post('/signup', authRateLimiter, async (req, res) => {
  try {
    // Validate input
    const validation = validate(signupSchema, req.body);
    if (!validation.success) {
      return res.status(400).json(createErrorResponse(400, 'Invalid input', validation.errors));
    }

    const { email, password, displayName } = validation.data;

    // Connect to database
    const { db } = await connectToDatabase();
    const usersCollection = db.collection('users');

    // Check if user already exists
    const existingUser = await usersCollection.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json(createErrorResponse(409, 'User already exists'));
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const newUser = {
      email: email.toLowerCase(),
      passwordHash,
      displayName,
      preferences: {
        defaultListVisibility: true,
        theme: 'system',
        allowClaimsByDefault: true
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await usersCollection.insertOne(newUser);

    // Generate JWT token
    const token = generateToken({
      userId: result.insertedId.toString(),
      email: newUser.email
    });

    // Set auth cookie
    res.cookie('auth_token', token, getAuthCookieOptions());

    return res.status(201).json(createSuccessResponse({
      user: {
        id: result.insertedId.toString(),
        email: newUser.email,
        displayName: newUser.displayName,
        preferences: newUser.preferences
      }
    }, 201));

  } catch (error) {
    console.error('Signup error:', error);
    return res.status(500).json(createErrorResponse(500, 'Internal server error'));
  }
});

// POST /api/auth/login
router.post('/login', authRateLimiter, async (req, res) => {
  try {
    // Validate input
    const validation = validate(loginSchema, req.body);
    if (!validation.success) {
      return res.status(400).json(createErrorResponse(400, 'Invalid input', validation.errors));
    }

    const { email, password } = validation.data;

    // Connect to database
    const { db } = await connectToDatabase();
    const usersCollection = db.collection('users');

    // Find user
    const user = await usersCollection.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json(createErrorResponse(401, 'Invalid credentials'));
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json(createErrorResponse(401, 'Invalid credentials'));
    }

    // Generate JWT token
    const token = generateToken({
      userId: user._id.toString(),
      email: user.email
    });

    // Set auth cookie
    res.cookie('auth_token', token, getAuthCookieOptions());

    return res.status(200).json(createSuccessResponse({
      user: {
        id: user._id.toString(),
        email: user.email,
        displayName: user.displayName,
        preferences: user.preferences
      }
    }));

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json(createErrorResponse(500, 'Internal server error'));
  }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  try {
    // Clear auth cookie
    res.cookie('auth_token', '', getLogoutCookieOptions());

    return res.status(200).json(createSuccessResponse({ message: 'Logged out successfully' }));

  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json(createErrorResponse(500, 'Internal server error'));
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    // Connect to database
    const { db } = await connectToDatabase();
    const usersCollection = db.collection('users');

    // Get user data (req.user is set by requireAuth middleware)
    const user = await usersCollection.findOne(
      { _id: new ObjectId(req.user.userId) },
      { projection: { passwordHash: 0 } } // Exclude password hash
    );

    if (!user) {
      return res.status(404).json(createErrorResponse(404, 'User not found'));
    }

    return res.status(200).json(createSuccessResponse({
      user: {
        id: user._id.toString(),
        email: user.email,
        displayName: user.displayName,
        preferences: user.preferences,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    }));

  } catch (error) {
    console.error('Get user error:', error);
    return res.status(500).json(createErrorResponse(500, 'Internal server error'));
  }
});

export default router;

