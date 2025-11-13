import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../_db.js';
import { requireAuth } from '../_middleware/auth.js';
import { validate, updateItemSchema, objectIdSchema } from '../_utils/validation.js';
import { createErrorResponse, createSuccessResponse, applySecurityHeaders, getCorsHeaders } from '../_utils/security.js';
import { checkRateLimit, rateLimitPresets } from '../_middleware/rateLimit.js';

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }

  if (!['PATCH', 'DELETE'].includes(req.method)) {
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

    // Extract and validate item ID
    const itemId = req.query.id || req.url.split('/').pop();
    const idValidation = validate(objectIdSchema, itemId);
    if (!idValidation.success) {
      return res.status(400).json(createErrorResponse(400, 'Invalid item ID'));
    }

    // Connect to database
    const { db } = await connectToDatabase();
    const listsCollection = db.collection('lists');
    const itemsCollection = db.collection('items');

    // Get item and verify ownership through list
    const item = await itemsCollection.findOne({ _id: new ObjectId(itemId) });
    if (!item) {
      return res.status(404).json(createErrorResponse(404, 'Item not found'));
    }

    const list = await listsCollection.findOne({ 
      _id: { $toString: item.listId },
      ownerId: auth.user.userId 
    });

    if (!list) {
      return res.status(403).json(createErrorResponse(403, 'Access denied'));
    }

    // Handle different methods
    if (req.method === 'PATCH') {
      // Update item
      const validation = validate(updateItemSchema, req.body);
      if (!validation.success) {
        return res.status(400).json(createErrorResponse(400, 'Invalid input', validation.errors));
      }

      const updates = {
        ...validation.data,
        updatedAt: new Date()
      };

      await itemsCollection.updateOne(
        { _id: new ObjectId(itemId) },
        { $set: updates }
      );

      const updatedItem = await itemsCollection.findOne({ _id: new ObjectId(itemId) });

      // Apply security headers
      Object.entries(applySecurityHeaders()).forEach(([key, value]) => {
        res.setHeader(key, value);
      });

      // Apply CORS headers if needed
      Object.entries(getCorsHeaders(req)).forEach(([key, value]) => {
        res.setHeader(key, value);
      });

      return res.status(200).json(createSuccessResponse({
        item: {
          id: updatedItem._id.toString(),
          listId: updatedItem.listId,
          title: updatedItem.title,
          url: updatedItem.url,
          price: updatedItem.price,
          imageUrl: updatedItem.imageUrl,
          category: updatedItem.category,
          priority: updatedItem.priority,
          notes: updatedItem.notes,
          createdAt: updatedItem.createdAt,
          updatedAt: updatedItem.updatedAt
        }
      }));
    }

    if (req.method === 'DELETE') {
      // Delete associated claims first
      const claimsCollection = db.collection('claims');
      await claimsCollection.deleteMany({ itemId: itemId });

      // Delete item
      await itemsCollection.deleteOne({ _id: new ObjectId(itemId) });

      // Apply security headers
      Object.entries(applySecurityHeaders()).forEach(([key, value]) => {
        res.setHeader(key, value);
      });

      // Apply CORS headers if needed
      Object.entries(getCorsHeaders(req)).forEach(([key, value]) => {
        res.setHeader(key, value);
      });

      return res.status(200).json(createSuccessResponse({
        message: 'Item deleted successfully'
      }));
    }

  } catch (error) {
    console.error('Item operation error:', error);
    return res.status(500).json(createErrorResponse(500, 'Internal server error'));
  }
}

