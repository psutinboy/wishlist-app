import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../_db.js';
import { requireAuth } from '../_middleware/auth.js';
import { validate, updateListSchema, objectIdSchema } from '../_utils/validation.js';
import { createErrorResponse, createSuccessResponse, applySecurityHeaders, getCorsHeaders } from '../_utils/security.js';
import { checkRateLimit, rateLimitPresets } from '../_middleware/rateLimit.js';

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }

  if (!['GET', 'PATCH', 'DELETE'].includes(req.method)) {
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

    // Extract and validate list ID
    const listId = req.query.id || req.url.split('/').pop();
    const idValidation = validate(objectIdSchema, listId);
    if (!idValidation.success) {
      return res.status(400).json(createErrorResponse(400, 'Invalid list ID'));
    }

    // Connect to database
    const { db } = await connectToDatabase();
    const listsCollection = db.collection('lists');

    // Verify ownership
    const list = await listsCollection.findOne({ 
      _id: new ObjectId(listId),
      ownerId: auth.user.userId 
    });

    if (!list) {
      return res.status(404).json(createErrorResponse(404, 'List not found'));
    }

    // Handle different methods
    if (req.method === 'GET') {
      // Get list with items
      const itemsCollection = db.collection('items');
      const items = await itemsCollection
        .find({ listId: listId })
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
        list: {
          id: list._id.toString(),
          ownerId: list.ownerId,
          title: list.title,
          isPublic: list.isPublic,
          shareId: list.shareId,
          createdAt: list.createdAt,
          updatedAt: list.updatedAt
        },
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
    }

    if (req.method === 'PATCH') {
      // Update list
      const validation = validate(updateListSchema, req.body);
      if (!validation.success) {
        return res.status(400).json(createErrorResponse(400, 'Invalid input', validation.errors));
      }

      const updates = {
        ...validation.data,
        updatedAt: new Date()
      };

      await listsCollection.updateOne(
        { _id: new ObjectId(listId) },
        { $set: updates }
      );

      const updatedList = await listsCollection.findOne({ _id: new ObjectId(listId) });

      // Apply security headers
      Object.entries(applySecurityHeaders()).forEach(([key, value]) => {
        res.setHeader(key, value);
      });

      // Apply CORS headers if needed
      Object.entries(getCorsHeaders(req)).forEach(([key, value]) => {
        res.setHeader(key, value);
      });

      return res.status(200).json(createSuccessResponse({
        list: {
          id: updatedList._id.toString(),
          ownerId: updatedList.ownerId,
          title: updatedList.title,
          isPublic: updatedList.isPublic,
          shareId: updatedList.shareId,
          createdAt: updatedList.createdAt,
          updatedAt: updatedList.updatedAt
        }
      }));
    }

    if (req.method === 'DELETE') {
      // Cascade delete: list → items → claims
      const itemsCollection = db.collection('items');
      const claimsCollection = db.collection('claims');

      // Get all items for this list
      const items = await itemsCollection.find({ listId: listId }).toArray();
      const itemIds = items.map(item => item._id.toString());

      // Delete all claims for these items
      if (itemIds.length > 0) {
        await claimsCollection.deleteMany({ itemId: { $in: itemIds } });
      }

      // Delete all items for this list
      await itemsCollection.deleteMany({ listId: listId });

      // Delete the list
      await listsCollection.deleteOne({ _id: new ObjectId(listId) });

      // Apply security headers
      Object.entries(applySecurityHeaders()).forEach(([key, value]) => {
        res.setHeader(key, value);
      });

      // Apply CORS headers if needed
      Object.entries(getCorsHeaders(req)).forEach(([key, value]) => {
        res.setHeader(key, value);
      });

      return res.status(200).json(createSuccessResponse({
        message: 'List and associated items deleted successfully'
      }));
    }

  } catch (error) {
    console.error('List operation error:', error);
    return res.status(500).json(createErrorResponse(500, 'Internal server error'));
  }
}

