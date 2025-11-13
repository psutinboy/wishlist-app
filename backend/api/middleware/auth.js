import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Generate JWT token
 * @param {Object} payload - Token payload (userId, email)
 * @returns {string} - JWT token
 */
export function generateToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
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
 */
export function requireAuth(req, res, next) {
  const token = req.cookies.auth_token;
  const user = verifyToken(token);

  if (!user) {
    return res.status(401).json({
      error: 'Authentication required',
      statusCode: 401
    });
  }

  req.user = user;
  next();
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
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
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

