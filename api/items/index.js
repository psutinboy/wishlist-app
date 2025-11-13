import { connectToDatabase } from '../_db.js';
import { requireAuth } from '../_middleware/auth.js';
import { validate, objectIdSchema } from '../_utils/validation.js';
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
    const rateCheck = checkRateLimit(`items:${auth.user.userId}`, rateLimitPresets.general);
    if (!rateCheck.allowed) {
      return res.status(429).json(createErrorResponse(429, 'Too many requests'));
    }

    // Validate listId from query
    const listId = req.query.listId;
    if (!listId) {
      return res.status(400).json(createErrorResponse(400, 'listId query parameter is required'));
    }

    const idValidation = validate(objectIdSchema, listId);
    if (!idValidation.success) {
      return res.status(400).json(createErrorResponse(400, 'Invalid list ID'));
    }

    // Connect to database
    const { db } = await connectToDatabase();
    const listsCollection = db.collection('lists');
    const itemsCollection = db.collection('items');

    // Verify list ownership
    const list = await listsCollection.findOne({ 
      _id: { $toString: listId },
      ownerId: auth.user.userId 
    });

    if (!list) {
      return res.status(404).json(createErrorResponse(404, 'List not found'));
    }

    // Get items for this list
    const items = await itemsCollection
      .find({ listId: listId })
      .sort({ category: 1, priority: -1, createdAt: -1 })
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
      items: items.map(item => ({
        id: item._id.toString(),
        listId: item.listId,
        title: item.title,
        url: item.url,
        price: item.price,
        imageUrl: item.imageUrl,
        category: item.category,
        priority: item.priority,
        notes: item.notes,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      }))
    }));

  } catch (error) {
    console.error('Get items error:', error);
    return res.status(500).json(createErrorResponse(500, 'Internal server error'));
  }
}

