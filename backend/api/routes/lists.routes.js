import express from 'express';
import { ObjectId } from 'mongodb';
import { nanoid } from 'nanoid';
import { connectToDatabase } from '../utils/db.js';
import { requireAuth } from '../middleware/auth.js';
import { validate, createListSchema, updateListSchema, objectIdSchema } from '../utils/validation.js';
import { createErrorResponse, createSuccessResponse } from '../utils/security.js';
import { generalRateLimiter, getClientIp, rateLimiter, rateLimitPresets } from '../middleware/rateLimit.js';

const router = express.Router();

// GET /api/lists - Get all lists for the authenticated user
router.get('/', requireAuth, generalRateLimiter, async (req, res) => {
  try {
    // Connect to database
    const { db } = await connectToDatabase();
    const listsCollection = db.collection('lists');

    // Get all lists for the user
    const lists = await listsCollection
      .find({ ownerId: req.user.userId })
      .sort({ createdAt: -1 })
      .toArray();

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
});

// POST /api/lists - Create a new list
router.post('/', requireAuth, generalRateLimiter, async (req, res) => {
  try {
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
      ownerId: req.user.userId,
      title,
      isPublic,
      shareId,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await listsCollection.insertOne(newList);

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
});

// GET /api/lists/share/:shareId - PUBLIC endpoint to view a shared list
router.get('/share/:shareId', rateLimiter({ ...rateLimitPresets.general, keyPrefix: 'share' }), async (req, res) => {
  try {
    const { shareId } = req.params;

    if (!shareId || shareId.length < 5) {
      return res.status(400).json(createErrorResponse(400, 'Invalid share ID'));
    }

    // Connect to database
    const { db } = await connectToDatabase();
    const listsCollection = db.collection('lists');
    const itemsCollection = db.collection('items');
    const claimsCollection = db.collection('claims');
    const usersCollection = db.collection('users');

    // Find list by shareId
    const list = await listsCollection.findOne({ shareId });

    if (!list) {
      return res.status(404).json(createErrorResponse(404, 'List not found'));
    }

    // Check if list is public
    if (!list.isPublic) {
      return res.status(403).json(createErrorResponse(403, 'This list is private'));
    }

    // Get list owner info (display name only)
    const owner = await usersCollection.findOne(
      { _id: new ObjectId(list.ownerId) },
      { projection: { displayName: 1 } }
    );

    // Get items for this list
    const items = await itemsCollection
      .find({ listId: list._id.toString() })
      .sort({ category: 1, priority: -1, createdAt: -1 })
      .toArray();

    // Get claim status for each item (without revealing claimer details)
    const itemIds = items.map(item => item._id.toString());
    const claims = await claimsCollection
      .find({ itemId: { $in: itemIds } })
      .toArray();

    const claimMap = {};
    claims.forEach(claim => {
      claimMap[claim.itemId] = {
        isClaimed: true,
        claimedAt: claim.claimedAt
      };
    });

    return res.status(200).json(createSuccessResponse({
      list: {
        title: list.title,
        ownerName: owner?.displayName || 'Someone',
        createdAt: list.createdAt
      },
      items: items.map(item => ({
        id: item._id.toString(),
        title: item.title,
        url: item.url,
        price: item.price,
        imageUrl: item.imageUrl,
        category: item.category,
        priority: item.priority,
        notes: item.notes,
        isClaimed: claimMap[item._id.toString()]?.isClaimed || false,
        claimedAt: claimMap[item._id.toString()]?.claimedAt
      }))
    }));

  } catch (error) {
    console.error('Share list error:', error);
    return res.status(500).json(createErrorResponse(500, 'Internal server error'));
  }
});

// GET /api/lists/:id - Get a specific list with items (owner only)
router.get('/:id', requireAuth, generalRateLimiter, async (req, res) => {
  try {
    const { id } = req.params;

    // Validate list ID
    const idValidation = validate(objectIdSchema, id);
    if (!idValidation.success) {
      return res.status(400).json(createErrorResponse(400, 'Invalid list ID'));
    }

    // Connect to database
    const { db } = await connectToDatabase();
    const listsCollection = db.collection('lists');

    // Verify ownership
    const list = await listsCollection.findOne({ 
      _id: new ObjectId(id),
      ownerId: req.user.userId 
    });

    if (!list) {
      return res.status(404).json(createErrorResponse(404, 'List not found'));
    }

    // Get list with items
    const itemsCollection = db.collection('items');
    const items = await itemsCollection
      .find({ listId: id })
      .sort({ createdAt: -1 })
      .toArray();

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

  } catch (error) {
    console.error('Get list error:', error);
    return res.status(500).json(createErrorResponse(500, 'Internal server error'));
  }
});

// PATCH /api/lists/:id - Update a list
router.patch('/:id', requireAuth, generalRateLimiter, async (req, res) => {
  try {
    const { id } = req.params;

    // Validate list ID
    const idValidation = validate(objectIdSchema, id);
    if (!idValidation.success) {
      return res.status(400).json(createErrorResponse(400, 'Invalid list ID'));
    }

    // Validate input
    const validation = validate(updateListSchema, req.body);
    if (!validation.success) {
      return res.status(400).json(createErrorResponse(400, 'Invalid input', validation.errors));
    }

    // Connect to database
    const { db } = await connectToDatabase();
    const listsCollection = db.collection('lists');

    // Verify ownership
    const list = await listsCollection.findOne({ 
      _id: new ObjectId(id),
      ownerId: req.user.userId 
    });

    if (!list) {
      return res.status(404).json(createErrorResponse(404, 'List not found'));
    }

    // Update list
    const updates = {
      ...validation.data,
      updatedAt: new Date()
    };

    await listsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updates }
    );

    const updatedList = await listsCollection.findOne({ _id: new ObjectId(id) });

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

  } catch (error) {
    console.error('Update list error:', error);
    return res.status(500).json(createErrorResponse(500, 'Internal server error'));
  }
});

// DELETE /api/lists/:id - Delete a list (cascade delete items and claims)
router.delete('/:id', requireAuth, generalRateLimiter, async (req, res) => {
  try {
    const { id } = req.params;

    // Validate list ID
    const idValidation = validate(objectIdSchema, id);
    if (!idValidation.success) {
      return res.status(400).json(createErrorResponse(400, 'Invalid list ID'));
    }

    // Connect to database
    const { db } = await connectToDatabase();
    const listsCollection = db.collection('lists');
    const itemsCollection = db.collection('items');
    const claimsCollection = db.collection('claims');

    // Verify ownership
    const list = await listsCollection.findOne({ 
      _id: new ObjectId(id),
      ownerId: req.user.userId 
    });

    if (!list) {
      return res.status(404).json(createErrorResponse(404, 'List not found'));
    }

    // Cascade delete: list → items → claims
    // Get all items for this list
    const items = await itemsCollection.find({ listId: id }).toArray();
    const itemIds = items.map(item => item._id.toString());

    // Delete all claims for these items
    if (itemIds.length > 0) {
      await claimsCollection.deleteMany({ itemId: { $in: itemIds } });
    }

    // Delete all items for this list
    await itemsCollection.deleteMany({ listId: id });

    // Delete the list
    await listsCollection.deleteOne({ _id: new ObjectId(id) });

    return res.status(200).json(createSuccessResponse({
      message: 'List and associated items deleted successfully'
    }));

  } catch (error) {
    console.error('Delete list error:', error);
    return res.status(500).json(createErrorResponse(500, 'Internal server error'));
  }
});

export default router;

