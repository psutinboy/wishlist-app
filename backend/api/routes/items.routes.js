import express from 'express';
import { ObjectId } from 'mongodb';
import { parse } from 'node-html-parser';
import { connectToDatabase } from '../utils/db.js';
import { requireAuth } from '../middleware/auth.js';
import { validate, createItemSchema, updateItemSchema, objectIdSchema, previewUrlSchema } from '../utils/validation.js';
import { createErrorResponse, createSuccessResponse, sanitizeUrl, sanitizeHtml } from '../utils/security.js';
import { generalRateLimiter, previewRateLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

// GET /api/items?listId=xxx - Get all items for a list
router.get('/', requireAuth, generalRateLimiter, async (req, res) => {
  try {
    const { listId } = req.query;

    if (!listId) {
      return res.status(400).json(createErrorResponse(400, 'listId query parameter is required'));
    }

    // Validate list ID
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
      _id: new ObjectId(listId),
      ownerId: req.user.userId 
    });

    if (!list) {
      return res.status(404).json(createErrorResponse(404, 'List not found'));
    }

    // Get items for this list
    const items = await itemsCollection
      .find({ listId: listId })
      .sort({ category: 1, priority: -1, createdAt: -1 })
      .toArray();

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
});

// POST /api/items/preview - Preview URL metadata
router.post('/preview', requireAuth, previewRateLimiter, async (req, res) => {
  try {
    // Validate input
    const validation = validate(previewUrlSchema, req.body);
    if (!validation.success) {
      return res.status(400).json(createErrorResponse(400, 'Invalid input', validation.errors));
    }

    const { url } = validation.data;

    // Sanitize URL
    const urlCheck = sanitizeUrl(url);
    if (!urlCheck.valid) {
      return res.status(400).json(createErrorResponse(400, urlCheck.error));
    }

    // Fetch URL with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    let response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; WishlistBot/1.0)'
        }
      });
      clearTimeout(timeoutId);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        return res.status(408).json(createErrorResponse(408, 'Request timeout'));
      }
      return res.status(400).json(createErrorResponse(400, 'Failed to fetch URL'));
    }

    if (!response.ok) {
      return res.status(400).json(createErrorResponse(400, 'Failed to fetch URL'));
    }

    // Parse HTML
    const html = await response.text();
    const root = parse(html);

    // Extract Open Graph tags
    const getMetaContent = (property) => {
      const tag = root.querySelector(`meta[property="${property}"]`) || 
                  root.querySelector(`meta[name="${property}"]`);
      return tag?.getAttribute('content') || null;
    };

    const ogTitle = getMetaContent('og:title') || root.querySelector('title')?.text || null;
    const ogImage = getMetaContent('og:image');
    const ogPrice = getMetaContent('og:price:amount') || getMetaContent('product:price:amount');
    const ogDescription = getMetaContent('og:description') || getMetaContent('description');

    // Sanitize extracted data
    const metadata = {
      title: ogTitle ? sanitizeHtml(ogTitle).substring(0, 200) : null,
      imageUrl: ogImage && ogImage.startsWith('http') ? ogImage : null,
      price: ogPrice ? Math.round(parseFloat(ogPrice) * 100) : null, // Convert to cents
      description: ogDescription ? sanitizeHtml(ogDescription).substring(0, 500) : null
    };

    return res.status(200).json(createSuccessResponse({
      metadata,
      url
    }));

  } catch (error) {
    console.error('Preview URL error:', error);
    return res.status(500).json(createErrorResponse(500, 'Internal server error'));
  }
});

// POST /api/items - Create a new item
router.post('/', requireAuth, generalRateLimiter, async (req, res) => {
  try {
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
      _id: new ObjectId(itemData.listId),
      ownerId: req.user.userId 
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
});

// PATCH /api/items/:id - Update an item
router.patch('/:id', requireAuth, generalRateLimiter, async (req, res) => {
  try {
    const { id } = req.params;

    // Validate item ID
    const idValidation = validate(objectIdSchema, id);
    if (!idValidation.success) {
      return res.status(400).json(createErrorResponse(400, 'Invalid item ID'));
    }

    // Validate input
    const validation = validate(updateItemSchema, req.body);
    if (!validation.success) {
      return res.status(400).json(createErrorResponse(400, 'Invalid input', validation.errors));
    }

    // Connect to database
    const { db } = await connectToDatabase();
    const listsCollection = db.collection('lists');
    const itemsCollection = db.collection('items');

    // Get item and verify ownership through list
    const item = await itemsCollection.findOne({ _id: new ObjectId(id) });
    if (!item) {
      return res.status(404).json(createErrorResponse(404, 'Item not found'));
    }

    const list = await listsCollection.findOne({ 
      _id: new ObjectId(item.listId),
      ownerId: req.user.userId 
    });

    if (!list) {
      return res.status(403).json(createErrorResponse(403, 'Access denied'));
    }

    // Update item
    const updates = {
      ...validation.data,
      updatedAt: new Date()
    };

    await itemsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updates }
    );

    const updatedItem = await itemsCollection.findOne({ _id: new ObjectId(id) });

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

  } catch (error) {
    console.error('Update item error:', error);
    return res.status(500).json(createErrorResponse(500, 'Internal server error'));
  }
});

// DELETE /api/items/:id - Delete an item
router.delete('/:id', requireAuth, generalRateLimiter, async (req, res) => {
  try {
    const { id } = req.params;

    // Validate item ID
    const idValidation = validate(objectIdSchema, id);
    if (!idValidation.success) {
      return res.status(400).json(createErrorResponse(400, 'Invalid item ID'));
    }

    // Connect to database
    const { db } = await connectToDatabase();
    const listsCollection = db.collection('lists');
    const itemsCollection = db.collection('items');
    const claimsCollection = db.collection('claims');

    // Get item and verify ownership through list
    const item = await itemsCollection.findOne({ _id: new ObjectId(id) });
    if (!item) {
      return res.status(404).json(createErrorResponse(404, 'Item not found'));
    }

    const list = await listsCollection.findOne({ 
      _id: new ObjectId(item.listId),
      ownerId: req.user.userId 
    });

    if (!list) {
      return res.status(403).json(createErrorResponse(403, 'Access denied'));
    }

    // Delete associated claims first
    await claimsCollection.deleteMany({ itemId: id });

    // Delete item
    await itemsCollection.deleteOne({ _id: new ObjectId(id) });

    return res.status(200).json(createSuccessResponse({
      message: 'Item deleted successfully'
    }));

  } catch (error) {
    console.error('Delete item error:', error);
    return res.status(500).json(createErrorResponse(500, 'Internal server error'));
  }
});

export default router;

