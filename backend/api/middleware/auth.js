import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../utils/db.js';

dotenv.config();

/**
 * Generate JWT token
 * @param {Object} payload - Token payload (userId, email)
 * @returns {string} - JWT token
 */
export function generateToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '14d'
  });
}

/**
 * Verify JWT token from cookie
 * @param {string} token - JWT token
 * @returns {Object|null} - Decoded token payload or null
 */
export function verifyToken(token) {
  try {
    if (!token) {
      return null;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded;
  } catch (error) {
    return null;
  }
}

/**
 * Express middleware to require authentication
 * Attaches user data to req.user if authenticated
 * Also handles activity tracking and automatic token refresh
 */
export async function requireAuth(req, res, next) {
  const token = req.cookies.auth_token;
  const user = verifyToken(token);

  if (!user) {
    return res.status(401).json({
      error: 'Authentication required',
      statusCode: 401
    });
  }

  try {
    // Check user's last activity
    const { db } = await connectToDatabase();
    const usersCollection = db.collection('users');
    
    const dbUser = await usersCollection.findOne({ _id: new ObjectId(user.userId) });
    
    if (!dbUser) {
      return res.status(401).json({
        error: 'Authentication required',
        statusCode: 401
      });
    }

    // Check if lastActivity exists and if it's within 14 days
    const now = new Date();
    const twoWeeksInMs = 14 * 24 * 60 * 60 * 1000;
    
    if (dbUser.lastActivity) {
      const lastActivity = new Date(dbUser.lastActivity);
      const timeSinceLastActivity = now - lastActivity;
      
      // If more than 14 days of inactivity, reject and clear cookie
      if (timeSinceLastActivity > twoWeeksInMs) {
        res.cookie('auth_token', '', getLogoutCookieOptions());
        return res.status(401).json({
          error: 'Session expired due to inactivity',
          statusCode: 401
        });
      }
    }

    // Update lastActivity
    await usersCollection.updateOne(
      { _id: new ObjectId(user.userId) },
      { $set: { lastActivity: now } }
    );

    // Generate new token to extend session
    const newToken = generateToken({
      userId: user.userId,
      email: user.email
    });

    // Set new auth cookie
    res.cookie('auth_token', newToken, getAuthCookieOptions());

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      statusCode: 500
    });
  }
}

/**
 * Optional auth middleware - doesn't fail if no token
 * Attaches user data to req.user if authenticated, otherwise req.user is null
 */
export function optionalAuth(req, res, next) {
  const token = req.cookies.auth_token;
  const user = verifyToken(token);

  req.user = user || null;
  next();
}

/**
 * Create auth cookie options
 * @returns {Object} - Cookie options
 */
export function getAuthCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days in milliseconds
    path: '/'
  };
}

/**
 * Create logout cookie options
 * @returns {Object} - Cookie options
 */
export function getLogoutCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 0,
    path: '/'
  };
}

