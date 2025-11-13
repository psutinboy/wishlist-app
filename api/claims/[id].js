import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../_db.js';
import { validate, objectIdSchema, deleteClaimSchema } from '../_utils/validation.js';
import { createErrorResponse, createSuccessResponse, applySecurityHeaders, getCorsHeaders } from '../_utils/security.js';
import { checkRateLimit, getClientIp, rateLimitPresets } from '../_middleware/rateLimit.js';

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }

  if (req.method !== 'DELETE') {
    return res.status(405).json(createErrorResponse(405, 'Method not allowed'));
  }

  try {
    // Rate limiting by IP (public endpoint)
    const clientIp = getClientIp(req);
    const rateCheck = checkRateLimit(`claims:${clientIp}`, rateLimitPresets.general);
    if (!rateCheck.allowed) {
      return res.status(429).json(createErrorResponse(429, 'Too many requests'));
    }

    // Extract and validate claim ID
    const claimId = req.query.id || req.url.split('?')[0].split('/').pop();
    const idValidation = validate(objectIdSchema, claimId);
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
    const claim = await claimsCollection.findOne({ _id: new ObjectId(claimId) });
    if (!claim) {
      return res.status(404).json(createErrorResponse(404, 'Claim not found'));
    }

    if (claim.secretToken !== token) {
      return res.status(403).json(createErrorResponse(403, 'Invalid secret token'));
    }

    // Delete claim
    await claimsCollection.deleteOne({ _id: new ObjectId(claimId) });

    // Apply security headers
    Object.entries(applySecurityHeaders()).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    // Apply CORS headers if needed
    Object.entries(getCorsHeaders(req)).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    return res.status(200).json(createSuccessResponse({
      message: 'Claim removed successfully'
    }));

  } catch (error) {
    console.error('Delete claim error:', error);
    return res.status(500).json(createErrorResponse(500, 'Internal server error'));
  }
}

