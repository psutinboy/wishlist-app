import { connectToDatabase } from '../../_db.js';
import { createErrorResponse, createSuccessResponse, applySecurityHeaders, getCorsHeaders } from '../../_utils/security.js';
import { checkRateLimit, getClientIp, rateLimitPresets } from '../../_middleware/rateLimit.js';

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }

  if (req.method !== 'GET') {
    return res.status(405).json(createErrorResponse(405, 'Method not allowed'));
  }

  try {
    // Rate limiting (by IP since this is public)
    const clientIp = getClientIp(req);
    const rateCheck = checkRateLimit(`share:${clientIp}`, rateLimitPresets.general);
    if (!rateCheck.allowed) {
      return res.status(429).json(createErrorResponse(429, 'Too many requests'));
    }

    // Extract shareId from URL
    const shareId = req.query.shareId || req.url.split('/').pop();

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
      { _id: { $toString: list.ownerId } },
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
}

