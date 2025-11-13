import express from 'express';
import { ObjectId } from 'mongodb';
import { nanoid } from 'nanoid';
import { connectToDatabase } from '../utils/db.js';
import { validate, createClaimSchema, objectIdSchema, deleteClaimSchema } from '../utils/validation.js';
import { createErrorResponse, createSuccessResponse } from '../utils/security.js';
import { rateLimiter, rateLimitPresets } from '../middleware/rateLimit.js';

const router = express.Router();

// Rate limiter for public claims endpoints
const claimsRateLimiter = rateLimiter({ ...rateLimitPresets.general, keyPrefix: 'claims' });

// POST /api/claims - Create a claim (PUBLIC endpoint)
router.post('/', claimsRateLimiter, async (req, res) => {
  try {
    // Validate input
    const validation = validate(createClaimSchema, req.body);
    if (!validation.success) {
      return res.status(400).json(createErrorResponse(400, 'Invalid input', validation.errors));
    }

    const { itemId, claimerName, claimerNote } = validation.data;

    // Connect to database
    const { db } = await connectToDatabase();
    const itemsCollection = db.collection('items');
    const claimsCollection = db.collection('claims');
    const listsCollection = db.collection('lists');

    // Verify item exists
    const item = await itemsCollection.findOne({ _id: new ObjectId(itemId) });
    if (!item) {
      return res.status(404).json(createErrorResponse(404, 'Item not found'));
    }

    // Verify list is public
    const list = await listsCollection.findOne({ _id: new ObjectId(item.listId) });
    if (!list || !list.isPublic) {
      return res.status(403).json(createErrorResponse(403, 'This list is not public'));
    }

    // Check if item is already claimed
    const existingClaim = await claimsCollection.findOne({ itemId: itemId });
    if (existingClaim) {
      return res.status(409).json(createErrorResponse(409, 'This item has already been claimed'));
    }

    // Generate secret token
    let secretToken;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 5;

    while (!isUnique && attempts < maxAttempts) {
      secretToken = nanoid(32); // 32 character secret token
      const existing = await claimsCollection.findOne({ secretToken });
      if (!existing) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      return res.status(500).json(createErrorResponse(500, 'Failed to generate unique token'));
    }

    // Create claim
    const newClaim = {
      itemId: itemId,
      claimerName,
      claimerNote: claimerNote || null,
      secretToken,
      claimedAt: new Date()
    };

    const result = await claimsCollection.insertOne(newClaim);

    return res.status(201).json(createSuccessResponse({
      claim: {
        id: result.insertedId.toString(),
        itemId: newClaim.itemId,
        claimerName: newClaim.claimerName,
        secretToken: newClaim.secretToken,
        claimedAt: newClaim.claimedAt
      },
      message: 'Item claimed successfully. Save your secret token to unclaim later.'
    }, 201));

  } catch (error) {
    console.error('Create claim error:', error);
    return res.status(500).json(createErrorResponse(500, 'Internal server error'));
  }
});

// DELETE /api/claims/:id?token=xxx - Delete a claim (PUBLIC endpoint)
router.delete('/:id', claimsRateLimiter, async (req, res) => {
  try {
    const { id } = req.params;

    // Validate claim ID
    const idValidation = validate(objectIdSchema, id);
    if (!idValidation.success) {
      return res.status(400).json(createErrorResponse(400, 'Invalid claim ID'));
    }

    // Validate token from query params
    const tokenValidation = validate(deleteClaimSchema, { token: req.query.token });
    if (!tokenValidation.success) {
      return res.status(400).json(createErrorResponse(400, 'Secret token is required'));
    }

    const { token } = tokenValidation.data;

    // Connect to database
    const { db } = await connectToDatabase();
    const claimsCollection = db.collection('claims');

    // Find claim by ID and verify token
    const claim = await claimsCollection.findOne({ _id: new ObjectId(id) });
    if (!claim) {
      return res.status(404).json(createErrorResponse(404, 'Claim not found'));
    }

    if (claim.secretToken !== token) {
      return res.status(403).json(createErrorResponse(403, 'Invalid secret token'));
    }

    // Delete claim
    await claimsCollection.deleteOne({ _id: new ObjectId(id) });

    return res.status(200).json(createSuccessResponse({
      message: 'Claim removed successfully'
    }));

  } catch (error) {
    console.error('Delete claim error:', error);
    return res.status(500).json(createErrorResponse(500, 'Internal server error'));
  }
});

export default router;

