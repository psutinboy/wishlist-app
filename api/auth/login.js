import bcrypt from 'bcrypt';
import { connectToDatabase } from '../_db.js';
import { validate, loginSchema } from '../_utils/validation.js';
import { createErrorResponse, createSuccessResponse, applySecurityHeaders, getCorsHeaders } from '../_utils/security.js';
import { generateToken, createAuthCookie } from '../_middleware/auth.js';
import { checkRateLimit, getClientIp, rateLimitPresets } from '../_middleware/rateLimit.js';

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }

  if (req.method !== 'POST') {
    return res.status(405).json(createErrorResponse(405, 'Method not allowed'));
  }

  try {
    // Rate limiting
    const clientIp = getClientIp(req);
    const rateCheck = checkRateLimit(`auth:${clientIp}`, rateLimitPresets.auth);
    
    if (!rateCheck.allowed) {
      return res.status(429).json(createErrorResponse(429, 'Too many requests. Please try again later.'));
    }

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
    res.setHeader('Set-Cookie', createAuthCookie(token));
    
    // Apply security headers
    Object.entries(applySecurityHeaders()).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    // Apply CORS headers if needed
    Object.entries(getCorsHeaders(req)).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

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
}

