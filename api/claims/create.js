import { ObjectId } from 'mongodb';
import { nanoid } from 'nanoid';
import { connectToDatabase } from '../_db.js';
import { validate, createClaimSchema } from '../_utils/validation.js';
import { createErrorResponse, createSuccessResponse, applySecurityHeaders, getCorsHeaders } from '../_utils/security.js';
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
    // Rate limiting by IP (public endpoint)
    const clientIp = getClientIp(req);
    const rateCheck = checkRateLimit(`claims:${clientIp}`, rateLimitPresets.general);
    if (!rateCheck.allowed) {
      return res.status(429).json(createErrorResponse(429, 'Too many requests'));
    }

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
    const list = await listsCollection.findOne({ _id: { $toString: item.listId } });
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

    // Apply security headers
    Object.entries(applySecurityHeaders()).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    // Apply CORS headers if needed
    Object.entries(getCorsHeaders(req)).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

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
}

