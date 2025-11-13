import bcrypt from 'bcrypt';
import { connectToDatabase } from '../_db.js';
import { validate, signupSchema } from '../_utils/validation.js';
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
    res.setHeader('Set-Cookie', createAuthCookie(token));
    
    // Apply security headers
    Object.entries(applySecurityHeaders()).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    // Apply CORS headers if needed
    Object.entries(getCorsHeaders(req)).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

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
}

