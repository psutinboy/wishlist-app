import { nanoid } from 'nanoid';
import { connectToDatabase } from '../_db.js';
import { requireAuth } from '../_middleware/auth.js';
import { validate, createListSchema } from '../_utils/validation.js';
import { createErrorResponse, createSuccessResponse, applySecurityHeaders, getCorsHeaders } from '../_utils/security.js';
import { checkRateLimit, rateLimitPresets } from '../_middleware/rateLimit.js';

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }

  if (req.method !== 'POST') {
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

    // Validate input
    const validation = validate(createListSchema, req.body);
    if (!validation.success) {
      return res.status(400).json(createErrorResponse(400, 'Invalid input', validation.errors));
    }

    const { title, isPublic } = validation.data;

    // Connect to database
    const { db } = await connectToDatabase();
    const listsCollection = db.collection('lists');

    // Generate unique shareId
    let shareId;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 5;

    while (!isUnique && attempts < maxAttempts) {
      shareId = nanoid(10); // 10 character URL-safe ID
      const existing = await listsCollection.findOne({ shareId });
      if (!existing) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      return res.status(500).json(createErrorResponse(500, 'Failed to generate unique share ID'));
    }

    // Create list
    const newList = {
      ownerId: auth.user.userId,
      title,
      isPublic,
      shareId,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await listsCollection.insertOne(newList);

    // Apply security headers
    Object.entries(applySecurityHeaders()).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    // Apply CORS headers if needed
    Object.entries(getCorsHeaders(req)).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    return res.status(201).json(createSuccessResponse({
      list: {
        id: result.insertedId.toString(),
        ownerId: newList.ownerId,
        title: newList.title,
        isPublic: newList.isPublic,
        shareId: newList.shareId,
        createdAt: newList.createdAt,
        updatedAt: newList.updatedAt
      }
    }, 201));

  } catch (error) {
    console.error('Create list error:', error);
    return res.status(500).json(createErrorResponse(500, 'Internal server error'));
  }
}

