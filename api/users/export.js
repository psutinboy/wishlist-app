import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../_db.js';
import { requireAuth } from '../_middleware/auth.js';
import { createErrorResponse, applySecurityHeaders, getCorsHeaders } from '../_utils/security.js';
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

    // Rate limiting (stricter for export)
    const rateCheck = checkRateLimit(`export:${auth.user.userId}`, {
      windowMs: 60 * 60 * 1000, // 1 hour
      maxRequests: 5
    });
    if (!rateCheck.allowed) {
      return res.status(429).json(createErrorResponse(429, 'Too many export requests'));
    }

    // Connect to database
    const { db } = await connectToDatabase();
    const usersCollection = db.collection('users');
    const listsCollection = db.collection('lists');
    const itemsCollection = db.collection('items');
    const claimsCollection = db.collection('claims');

    // Get user data (excluding password hash)
    const user = await usersCollection.findOne(
      { _id: new ObjectId(auth.user.userId) },
      { projection: { passwordHash: 0 } }
    );

    if (!user) {
      return res.status(404).json(createErrorResponse(404, 'User not found'));
    }

    // Get all user's lists
    const lists = await listsCollection
      .find({ ownerId: auth.user.userId })
      .toArray();

    // Get all items for user's lists
    const listIds = lists.map(list => list._id.toString());
    const items = await itemsCollection
      .find({ listId: { $in: listIds } })
      .toArray();

    // Get all claims for user's items
    const itemIds = items.map(item => item._id.toString());
    const claims = await claimsCollection
      .find({ itemId: { $in: itemIds } })
      .toArray();

    // Build export data
    const exportData = {
      exportedAt: new Date().toISOString(),
      user: {
        id: user._id.toString(),
        email: user.email,
        displayName: user.displayName,
        preferences: user.preferences,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      },
      lists: lists.map(list => ({
        id: list._id.toString(),
        title: list.title,
        isPublic: list.isPublic,
        shareId: list.shareId,
        createdAt: list.createdAt,
        updatedAt: list.updatedAt,
        items: items
          .filter(item => item.listId === list._id.toString())
          .map(item => ({
            id: item._id.toString(),
            title: item.title,
            url: item.url,
            price: item.price,
            imageUrl: item.imageUrl,
            category: item.category,
            priority: item.priority,
            notes: item.notes,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            claims: claims
              .filter(claim => claim.itemId === item._id.toString())
              .map(claim => ({
                id: claim._id.toString(),
                claimerName: claim.claimerName,
                claimerNote: claim.claimerNote,
                claimedAt: claim.claimedAt
                // secretToken intentionally excluded for security
              }))
          }))
      })),
      summary: {
        totalLists: lists.length,
        totalItems: items.length,
        totalClaims: claims.length
      }
    };

    // Apply security headers
    Object.entries(applySecurityHeaders()).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    // Apply CORS headers if needed
    Object.entries(getCorsHeaders(req)).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    // Set content disposition for download
    res.setHeader('Content-Disposition', `attachment; filename="wishlist-data-${Date.now()}.json"`);
    res.setHeader('Content-Type', 'application/json');

    return res.status(200).json(exportData);

  } catch (error) {
    console.error('Export data error:', error);
    return res.status(500).json(createErrorResponse(500, 'Internal server error'));
  }
}

