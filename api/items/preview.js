import { parse } from 'node-html-parser';
import { requireAuth } from '../_middleware/auth.js';
import { validate, previewUrlSchema } from '../_utils/validation.js';
import { createErrorResponse, createSuccessResponse, applySecurityHeaders, getCorsHeaders, sanitizeUrl, sanitizeHtml } from '../_utils/security.js';
import { checkRateLimit, rateLimitPresets } from '../_middleware/rateLimit.js';

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }

  if (req.method !== 'POST') {
    return res.status(405).json(createErrorResponse(405, 'Method not allowed'));
  }

  try {
    // Check authentication
    const auth = requireAuth(req);
    if (!auth.authenticated) {
      return res.status(401).json(createErrorResponse(401, auth.error));
    }

    // Rate limiting (stricter for preview)
    const rateCheck = checkRateLimit(`preview:${auth.user.userId}`, rateLimitPresets.preview);
    if (!rateCheck.allowed) {
      return res.status(429).json(createErrorResponse(429, 'Too many requests. Please wait before previewing another URL.'));
    }

    // Validate input
    const validation = validate(previewUrlSchema, req.body);
    if (!validation.success) {
      return res.status(400).json(createErrorResponse(400, 'Invalid input', validation.errors));
    }

    const { url } = validation.data;

    // Sanitize URL
    const urlCheck = sanitizeUrl(url);
    if (!urlCheck.valid) {
      return res.status(400).json(createErrorResponse(400, urlCheck.error));
    }

    // Fetch URL with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    let response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; WishlistBot/1.0)'
        }
      });
      clearTimeout(timeoutId);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        return res.status(408).json(createErrorResponse(408, 'Request timeout'));
      }
      return res.status(400).json(createErrorResponse(400, 'Failed to fetch URL'));
    }

    if (!response.ok) {
      return res.status(400).json(createErrorResponse(400, 'Failed to fetch URL'));
    }

    // Parse HTML
    const html = await response.text();
    const root = parse(html);

    // Extract Open Graph tags
    const getMetaContent = (property) => {
      const tag = root.querySelector(`meta[property="${property}"]`) || 
                  root.querySelector(`meta[name="${property}"]`);
      return tag?.getAttribute('content') || null;
    };

    const ogTitle = getMetaContent('og:title') || root.querySelector('title')?.text || null;
    const ogImage = getMetaContent('og:image');
    const ogPrice = getMetaContent('og:price:amount') || getMetaContent('product:price:amount');
    const ogDescription = getMetaContent('og:description') || getMetaContent('description');

    // Sanitize extracted data
    const metadata = {
      title: ogTitle ? sanitizeHtml(ogTitle).substring(0, 200) : null,
      imageUrl: ogImage && ogImage.startsWith('http') ? ogImage : null,
      price: ogPrice ? Math.round(parseFloat(ogPrice) * 100) : null, // Convert to cents
      description: ogDescription ? sanitizeHtml(ogDescription).substring(0, 500) : null
    };

    // Apply security headers
    Object.entries(applySecurityHeaders()).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    // Apply CORS headers if needed
    Object.entries(getCorsHeaders(req)).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    return res.status(200).json(createSuccessResponse({
      metadata,
      url
    }));

  } catch (error) {
    console.error('Preview URL error:', error);
    return res.status(500).json(createErrorResponse(500, 'Internal server error'));
  }
}

