import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../_db.js';
import { requireAuth } from '../_middleware/auth.js';
import { validate, createItemSchema } from '../_utils/validation.js';
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
    const rateCheck = checkRateLimit(`items:${auth.user.userId}`, rateLimitPresets.general);
    if (!rateCheck.allowed) {
      return res.status(429).json(createErrorResponse(429, 'Too many requests'));
    }

    // Validate input
    const validation = validate(createItemSchema, req.body);
    if (!validation.success) {
      return res.status(400).json(createErrorResponse(400, 'Invalid input', validation.errors));
    }

    const itemData = validation.data;

    // Connect to database
    const { db } = await connectToDatabase();
    const listsCollection = db.collection('lists');
    const itemsCollection = db.collection('items');

    // Verify list ownership
    const list = await listsCollection.findOne({ 
      _id: { $toString: itemData.listId },
      ownerId: auth.user.userId 
    });

    if (!list) {
      return res.status(404).json(createErrorResponse(404, 'List not found'));
    }

    // Create item
    const newItem = {
      ...itemData,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await itemsCollection.insertOne(newItem);

    // Apply security headers
    Object.entries(applySecurityHeaders()).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    // Apply CORS headers if needed
    Object.entries(getCorsHeaders(req)).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    return res.status(201).json(createSuccessResponse({
      item: {
        id: result.insertedId.toString(),
        listId: newItem.listId,
        title: newItem.title,
        url: newItem.url,
        price: newItem.price,
        imageUrl: newItem.imageUrl,
        category: newItem.category,
        priority: newItem.priority,
        notes: newItem.notes,
        createdAt: newItem.createdAt,
        updatedAt: newItem.updatedAt
      }
    }, 201));

  } catch (error) {
    console.error('Create item error:', error);
    return res.status(500).json(createErrorResponse(500, 'Internal server error'));
  }
}

