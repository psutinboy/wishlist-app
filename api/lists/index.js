import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../_db.js';
import { requireAuth } from '../_middleware/auth.js';
import { createErrorResponse, createSuccessResponse, applySecurityHeaders, getCorsHeaders } from '../_utils/security.js';
import { checkRateLimit, rateLimitPresets } from '../_middleware/rateLimit.js';

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }

  if (req.method !== 'GET') {
    return res.status(405).json(createErrorResponse(405, 'Method not allowed'));
  }

  try {
    // Check authentication
    const auth = requireAuth(req);
    if (!auth.authenticated) {
      return res.status(401).json(createErrorResponse(401, auth.error));
    }

    // Rate limiting
    const rateCheck = checkRateLimit(`lists:${auth.user.userId}`, rateLimitPresets.general);
    if (!rateCheck.allowed) {
      return res.status(429).json(createErrorResponse(429, 'Too many requests'));
    }

    // Connect to database
    const { db } = await connectToDatabase();
    const listsCollection = db.collection('lists');

    // Get all lists for the user
    const lists = await listsCollection
      .find({ ownerId: auth.user.userId })
      .sort({ createdAt: -1 })
      .toArray();

    // Apply security headers
    Object.entries(applySecurityHeaders()).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    // Apply CORS headers if needed
    Object.entries(getCorsHeaders(req)).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    return res.status(200).json(createSuccessResponse({
      lists: lists.map(list => ({
        id: list._id.toString(),
        ownerId: list.ownerId,
        title: list.title,
        isPublic: list.isPublic,
        shareId: list.shareId,
        createdAt: list.createdAt,
        updatedAt: list.updatedAt
      }))
    }));

  } catch (error) {
    console.error('Get lists error:', error);
    return res.status(500).json(createErrorResponse(500, 'Internal server error'));
  }
}

