import { createSuccessResponse, applySecurityHeaders, getCorsHeaders } from '../_utils/security.js';
import { createLogoutCookie } from '../_middleware/auth.js';

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
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

    return res.status(200).json(createSuccessResponse({ message: 'Logged out successfully' }));

  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

