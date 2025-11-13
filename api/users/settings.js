import bcrypt from 'bcrypt';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../_db.js';
import { requireAuth } from '../_middleware/auth.js';
import { validate, updateSettingsSchema } from '../_utils/validation.js';
import { createErrorResponse, createSuccessResponse, applySecurityHeaders, getCorsHeaders } from '../_utils/security.js';
import { checkRateLimit, rateLimitPresets } from '../_middleware/rateLimit.js';

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }

  if (req.method !== 'PATCH') {
    return res.status(405).json(createErrorResponse(405, 'Method not allowed'));
  }

  try {
    // Check authentication
    const auth = requireAuth(req);
    if (!auth.authenticated) {
      return res.status(401).json(createErrorResponse(401, auth.error));
    }

    // Rate limiting
    const rateCheck = checkRateLimit(`settings:${auth.user.userId}`, rateLimitPresets.general);
    if (!rateCheck.allowed) {
      return res.status(429).json(createErrorResponse(429, 'Too many requests'));
    }

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
    const user = await usersCollection.findOne({ _id: new ObjectId(auth.user.userId) });
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
      { _id: new ObjectId(auth.user.userId) },
      { $set: updateFields }
    );

    // Get updated user
    const updatedUser = await usersCollection.findOne(
      { _id: new ObjectId(auth.user.userId) },
      { projection: { passwordHash: 0 } }
    );

    // Apply security headers
    Object.entries(applySecurityHeaders()).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    // Apply CORS headers if needed
    Object.entries(getCorsHeaders(req)).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

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
}

