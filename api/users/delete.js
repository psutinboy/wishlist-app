import bcrypt from 'bcrypt';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../_db.js';
import { requireAuth } from '../_middleware/auth.js';
import { validate, deleteAccountSchema } from '../_utils/validation.js';
import { createErrorResponse, createSuccessResponse, applySecurityHeaders, getCorsHeaders } from '../_utils/security.js';
import { createLogoutCookie } from '../_middleware/auth.js';
import { checkRateLimit, rateLimitPresets } from '../_middleware/rateLimit.js';

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }

  if (req.method !== 'DELETE') {
    return res.status(405).json(createErrorResponse(405, 'Method not allowed'));
  }

  try {
    // Check authentication
    const auth = requireAuth(req);
    if (!auth.authenticated) {
      return res.status(401).json(createErrorResponse(401, auth.error));
    }

    // Rate limiting
    const rateCheck = checkRateLimit(`delete:${auth.user.userId}`, rateLimitPresets.auth);
    if (!rateCheck.allowed) {
      return res.status(429).json(createErrorResponse(429, 'Too many requests'));
    }

    // Validate input
    const validation = validate(deleteAccountSchema, req.body);
    if (!validation.success) {
      return res.status(400).json(createErrorResponse(400, 'Invalid input', validation.errors));
    }

    const { password, confirmation } = validation.data;

    if (confirmation !== 'DELETE') {
      return res.status(400).json(createErrorResponse(400, 'Confirmation must be "DELETE"'));
    }

    // Connect to database
    const { db } = await connectToDatabase();
    const usersCollection = db.collection('users');
    const listsCollection = db.collection('lists');
    const itemsCollection = db.collection('items');
    const claimsCollection = db.collection('claims');

    // Get user and verify password
    const user = await usersCollection.findOne({ _id: new ObjectId(auth.user.userId) });
    if (!user) {
      return res.status(404).json(createErrorResponse(404, 'User not found'));
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json(createErrorResponse(401, 'Invalid password'));
    }

    // Cascade delete all user data
    // 1. Get all user's lists
    const lists = await listsCollection
      .find({ ownerId: auth.user.userId })
      .toArray();

    // 2. Get all items for those lists
    const listIds = lists.map(list => list._id.toString());
    const items = await itemsCollection
      .find({ listId: { $in: listIds } })
      .toArray();

    // 3. Delete all claims for those items
    const itemIds = items.map(item => item._id.toString());
    if (itemIds.length > 0) {
      await claimsCollection.deleteMany({ itemId: { $in: itemIds } });
    }

    // 4. Delete all items
    if (listIds.length > 0) {
      await itemsCollection.deleteMany({ listId: { $in: listIds } });
    }

    // 5. Delete all lists
    await listsCollection.deleteMany({ ownerId: auth.user.userId });

    // 6. Delete user
    await usersCollection.deleteOne({ _id: new ObjectId(auth.user.userId) });

    // Clear auth cookie
    res.setHeader('Set-Cookie', createLogoutCookie());

    // Apply security headers
    Object.entries(applySecurityHeaders()).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    // Apply CORS headers if needed
    Object.entries(getCorsHeaders(req)).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    return res.status(200).json(createSuccessResponse({
      message: 'Account and all associated data deleted successfully'
    }));

  } catch (error) {
    console.error('Delete account error:', error);
    return res.status(500).json(createErrorResponse(500, 'Internal server error'));
  }
}

