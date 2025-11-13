import dotenv from 'dotenv';

dotenv.config();

// In-memory store for rate limiting (use Redis in production for multi-instance)
const rateLimitStore = new Map();

/**
 * Clean up old entries from rate limit store
 */
function cleanupStore() {
  const now = Date.now();
  for (const [key, data] of rateLimitStore.entries()) {
    if (now > data.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

// Cleanup every 5 minutes
setInterval(cleanupStore, 5 * 60 * 1000);

/**
 * Rate limiting middleware
 * @param {string} identifier - Unique identifier (IP, userId, etc.)
 * @param {Object} options - Rate limit options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.maxRequests - Max requests per window
 * @returns {{allowed: boolean, remaining?: number, resetTime?: number}}
 */
export function checkRateLimit(identifier, options = {}) {
  const windowMs = options.windowMs || parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000; // 15 min default
  const maxRequests = options.maxRequests || parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100;

  const now = Date.now();
  const data = rateLimitStore.get(identifier);

  if (!data || now > data.resetTime) {
    // First request or window expired
    rateLimitStore.set(identifier, {
      count: 1,
      resetTime: now + windowMs
    });
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetTime: now + windowMs
    };
  }

  if (data.count >= maxRequests) {
    // Rate limit exceeded
    return {
      allowed: false,
      remaining: 0,
      resetTime: data.resetTime
    };
  }

  // Increment count
  data.count++;
  rateLimitStore.set(identifier, data);

  return {
    allowed: true,
    remaining: maxRequests - data.count,
    resetTime: data.resetTime
  };
}

/**
 * Get client IP from request
 * @param {Request} req - Request object
 * @returns {string} - Client IP address
 */
export function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0] ||
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    'unknown'
  );
}

/**
 * Rate limit presets for different endpoint types
 */
export const rateLimitPresets = {
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5
  },
  preview: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10
  },
  general: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100
  }
};

