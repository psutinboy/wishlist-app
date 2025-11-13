import express from 'express';
import bcrypt from 'bcrypt';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../utils/db.js';
import { requireAuth, getLogoutCookieOptions } from '../middleware/auth.js';
import { validate, updateSettingsSchema, deleteAccountSchema } from '../utils/validation.js';
import { createErrorResponse, createSuccessResponse } from '../utils/security.js';
import { generalRateLimiter, rateLimiter, rateLimitPresets } from '../middleware/rateLimit.js';

const router = express.Router();

// PATCH /api/users/settings - Update user settings
router.patch('/settings', requireAuth, generalRateLimiter, async (req, res) => {
  try {
    // Validate input
    const validation = validate(updateSettingsSchema, req.body);
    if (!validation.success) {
      return res.status(400).json(createErrorResponse(400, 'Invalid input', validation.errors));
    }

    const updates = validation.data;

    // Connect to database
    const { db } = await connectToDatabase();
    const usersCollection = db.collection('users');

    // Get current user
    const user = await usersCollection.findOne({ _id: new ObjectId(req.user.userId) });
    if (!user) {
      return res.status(404).json(createErrorResponse(404, 'User not found'));
    }

    const updateFields = { updatedAt: new Date() };

    // Handle email change
    if (updates.email && updates.email !== user.email) {
      // Check if new email is already taken
      const existingUser = await usersCollection.findOne({ 
        email: updates.email.toLowerCase(),
        _id: { $ne: user._id }
      });
      if (existingUser) {
        return res.status(409).json(createErrorResponse(409, 'Email already in use'));
      }
      updateFields.email = updates.email.toLowerCase();
    }

    // Handle password change
    if (updates.newPassword && updates.currentPassword) {
      // Verify current password
      const isValidPassword = await bcrypt.compare(updates.currentPassword, user.passwordHash);
      if (!isValidPassword) {
        return res.status(401).json(createErrorResponse(401, 'Current password is incorrect'));
      }
      // Hash new password
      updateFields.passwordHash = await bcrypt.hash(updates.newPassword, 12);
    }

    // Handle display name change
    if (updates.displayName) {
      updateFields.displayName = updates.displayName;
    }

    // Handle preferences update
    if (updates.preferences) {
      updateFields.preferences = {
        ...user.preferences,
        ...updates.preferences
      };
    }

    // Update user
    await usersCollection.updateOne(
      { _id: new ObjectId(req.user.userId) },
      { $set: updateFields }
    );

    // Get updated user
    const updatedUser = await usersCollection.findOne(
      { _id: new ObjectId(req.user.userId) },
      { projection: { passwordHash: 0 } }
    );

    return res.status(200).json(createSuccessResponse({
      user: {
        id: updatedUser._id.toString(),
        email: updatedUser.email,
        displayName: updatedUser.displayName,
        preferences: updatedUser.preferences,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt
      },
      message: 'Settings updated successfully'
    }));

  } catch (error) {
    console.error('Update settings error:', error);
    return res.status(500).json(createErrorResponse(500, 'Internal server error'));
  }
});

// GET /api/users/export - Export all user data
router.get('/export', requireAuth, rateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 5,
  keyPrefix: 'export'
}), async (req, res) => {
  try {
    // Connect to database
    const { db } = await connectToDatabase();
    const usersCollection = db.collection('users');
    const listsCollection = db.collection('lists');
    const itemsCollection = db.collection('items');
    const claimsCollection = db.collection('claims');

    // Get user data (excluding password hash)
    const user = await usersCollection.findOne(
      { _id: new ObjectId(req.user.userId) },
      { projection: { passwordHash: 0 } }
    );

    if (!user) {
      return res.status(404).json(createErrorResponse(404, 'User not found'));
    }

    // Get all user's lists
    const lists = await listsCollection
      .find({ ownerId: req.user.userId })
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

    // Set content disposition for download
    res.setHeader('Content-Disposition', `attachment; filename="wishlist-data-${Date.now()}.json"`);
    res.setHeader('Content-Type', 'application/json');

    return res.status(200).json(exportData);

  } catch (error) {
    console.error('Export data error:', error);
    return res.status(500).json(createErrorResponse(500, 'Internal server error'));
  }
});

// DELETE /api/users/delete - Delete user account and all associated data
router.delete('/delete', requireAuth, rateLimiter({
  ...rateLimitPresets.auth,
  keyPrefix: 'delete'
}), async (req, res) => {
  try {
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
    const user = await usersCollection.findOne({ _id: new ObjectId(req.user.userId) });
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
      .find({ ownerId: req.user.userId })
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
    await listsCollection.deleteMany({ ownerId: req.user.userId });

    // 6. Delete user
    await usersCollection.deleteOne({ _id: new ObjectId(req.user.userId) });

    // Clear auth cookie
    res.cookie('auth_token', '', getLogoutCookieOptions());

    return res.status(200).json(createSuccessResponse({
      message: 'Account and all associated data deleted successfully'
    }));

  } catch (error) {
    console.error('Delete account error:', error);
    return res.status(500).json(createErrorResponse(500, 'Internal server error'));
  }
});

export default router;

