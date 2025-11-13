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
 * Get client IP from request
 * @param {Request} req - Express request object
 * @returns {string} - Client IP address
 */
export function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0] ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
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

/**
 * Rate limiting middleware factory
 * @param {Object} options - Rate limit options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.maxRequests - Max requests per window
 * @param {string} options.keyPrefix - Prefix for rate limit key
 * @returns {Function} - Express middleware
 */
export function rateLimiter(options = {}) {
  const windowMs = options.windowMs || rateLimitPresets.general.windowMs;
  const maxRequests = options.maxRequests || rateLimitPresets.general.maxRequests;
  const keyPrefix = options.keyPrefix || 'general';

  return (req, res, next) => {
    const identifier = `${keyPrefix}:${getClientIp(req)}`;
    const now = Date.now();
    const data = rateLimitStore.get(identifier);

    if (!data || now > data.resetTime) {
      // First request or window expired
      rateLimitStore.set(identifier, {
        count: 1,
        resetTime: now + windowMs
      });
      
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', maxRequests - 1);
      res.setHeader('X-RateLimit-Reset', new Date(now + windowMs).toISOString());
      
      return next();
    }

    if (data.count >= maxRequests) {
      // Rate limit exceeded
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', new Date(data.resetTime).toISOString());
      res.setHeader('Retry-After', Math.ceil((data.resetTime - now) / 1000));
      
      return res.status(429).json({
        error: 'Too many requests, please try again later',
        statusCode: 429,
        retryAfter: Math.ceil((data.resetTime - now) / 1000)
      });
    }

    // Increment count
    data.count++;
    rateLimitStore.set(identifier, data);

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', maxRequests - data.count);
    res.setHeader('X-RateLimit-Reset', new Date(data.resetTime).toISOString());

    next();
  };
}

/**
 * Auth rate limiter (strict)
 */
export const authRateLimiter = rateLimiter({
  ...rateLimitPresets.auth,
  keyPrefix: 'auth'
});

/**
 * Preview rate limiter (moderate)
 */
export const previewRateLimiter = rateLimiter({
  ...rateLimitPresets.preview,
  keyPrefix: 'preview'
});

/**
 * General rate limiter (lenient)
 */
export const generalRateLimiter = rateLimiter({
  ...rateLimitPresets.general,
  keyPrefix: 'general'
});

