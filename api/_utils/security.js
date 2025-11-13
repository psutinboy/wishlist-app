import dotenv from 'dotenv';

dotenv.config();

/**
 * Security headers for API responses
 */
export const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' https:; script-src 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin'
};

/**
 * Apply security headers to response
 * @param {Response} res - Response object (if using Express-like)
 * @returns {Object} - Headers object for Vercel serverless response
 */
export function applySecurityHeaders() {
  return securityHeaders;
}

/**
 * Sanitize URL to prevent SSRF attacks
 * @param {string} url - URL to sanitize
 * @returns {{valid: boolean, error?: string}}
 */
export function sanitizeUrl(url) {
  try {
    const parsed = new URL(url);

    // Only allow HTTPS
    if (parsed.protocol !== 'https:') {
      return { valid: false, error: 'Only HTTPS URLs are allowed' };
    }

    // Prevent localhost and private IPs
    const hostname = parsed.hostname.toLowerCase();
    const privatePatterns = [
      /^localhost$/i,
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^169\.254\./, // Link-local
      /^::1$/, // IPv6 localhost
      /^fc00:/, // IPv6 private
      /^fe80:/ // IPv6 link-local
    ];

    if (privatePatterns.some(pattern => pattern.test(hostname))) {
      return { valid: false, error: 'Private/local URLs are not allowed' };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Sanitize HTML content to prevent XSS
 * @param {string} html - HTML content to sanitize
 * @returns {string} - Sanitized HTML (strips all tags)
 */
export function sanitizeHtml(html) {
  if (!html) return '';
  
  // Strip all HTML tags and decode entities
  return html
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .trim();
}

/**
 * Create standardized error response
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message (generic, no sensitive info)
 * @param {Object} details - Optional details for development
 * @returns {Object} - Response object
 */
export function createErrorResponse(statusCode, message, details = null) {
  const response = {
    error: message,
    statusCode
  };

  // Only include details in development
  if (process.env.NODE_ENV === 'development' && details) {
    response.details = details;
  }

  return response;
}

/**
 * Create standardized success response
 * @param {any} data - Response data
 * @param {number} statusCode - HTTP status code (default 200)
 * @returns {Object} - Response object
 */
export function createSuccessResponse(data, statusCode = 200) {
  return {
    success: true,
    data,
    statusCode
  };
}

/**
 * CORS headers for development
 * @param {Request} req - Request object
 * @returns {Object} - CORS headers
 */
export function getCorsHeaders(req) {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:4200'];
  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true'
    };
  }

  return {};
}

