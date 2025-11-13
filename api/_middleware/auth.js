import jwt from 'jsonwebtoken';
import { parse } from 'cookie';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Verify JWT token from cookie
 * @param {Request} req - Request object
 * @returns {Object|null} - Decoded token payload or null
 */
export function verifyToken(req) {
  try {
    const cookies = parse(req.headers.cookie || '');
    const token = cookies.auth_token;

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
 * Middleware to require authentication
 * Returns user data if authenticated, or error response if not
 * @param {Request} req - Request object
 * @returns {{authenticated: boolean, user?: Object, error?: string}}
 */
export function requireAuth(req) {
  const user = verifyToken(req);

  if (!user) {
    return {
      authenticated: false,
      error: 'Authentication required'
    };
  }

  return {
    authenticated: true,
    user
  };
}

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
 * Create auth cookie string
 * @param {string} token - JWT token
 * @returns {string} - Cookie header value
 */
export function createAuthCookie(token) {
  const isProduction = process.env.NODE_ENV === 'production';
  
  return `auth_token=${token}; HttpOnly; ${isProduction ? 'Secure;' : ''} SameSite=Strict; Max-Age=${7 * 24 * 60 * 60}; Path=/`;
}

/**
 * Create logout cookie string (expires immediately)
 * @returns {string} - Cookie header value
 */
export function createLogoutCookie() {
  return 'auth_token=; HttpOnly; SameSite=Strict; Max-Age=0; Path=/';
}

