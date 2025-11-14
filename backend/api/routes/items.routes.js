import express from 'express';
import { ObjectId } from 'mongodb';
import { parse } from 'node-html-parser';
import { connectToDatabase } from '../utils/db.js';
import { requireAuth } from '../middleware/auth.js';
import { validate, createItemSchema, updateItemSchema, objectIdSchema, previewUrlSchema } from '../utils/validation.js';
import { createErrorResponse, createSuccessResponse, sanitizeUrl, sanitizeHtml } from '../utils/security.js';
import { generalRateLimiter, previewRateLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

// GET /api/items?listId=xxx - Get all items for a list
router.get('/', requireAuth, generalRateLimiter, async (req, res) => {
  try {
    const { listId } = req.query;

    if (!listId) {
      return res.status(400).json(createErrorResponse(400, 'listId query parameter is required'));
    }

    // Validate list ID
    const idValidation = validate(objectIdSchema, listId);
    if (!idValidation.success) {
      return res.status(400).json(createErrorResponse(400, 'Invalid list ID'));
    }

    // Connect to database
    const { db } = await connectToDatabase();
    const listsCollection = db.collection('lists');
    const itemsCollection = db.collection('items');

    // Verify list ownership
    const list = await listsCollection.findOne({ 
      _id: new ObjectId(listId),
      ownerId: req.user.userId 
    });

    if (!list) {
      return res.status(404).json(createErrorResponse(404, 'List not found'));
    }

    // Get items for this list
    const items = await itemsCollection
      .find({ listId: listId })
      .sort({ category: 1, priority: -1, createdAt: -1 })
      .toArray();

    return res.status(200).json(createSuccessResponse({
      items: items.map(item => ({
        id: item._id.toString(),
        listId: item.listId,
        title: item.title,
        url: item.url,
        price: item.price,
        imageUrl: item.imageUrl,
        category: item.category,
        priority: item.priority,
        notes: item.notes,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      }))
    }));

  } catch (error) {
    console.error('Get items error:', error);
    return res.status(500).json(createErrorResponse(500, 'Internal server error'));
  }
});

// Helper function: Local HTML scraping fallback
async function extractMetadataFromHTML(url) {
  // Fetch URL with timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 seconds

  let response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });
    clearTimeout(timeoutId);
  } catch (fetchError) {
    clearTimeout(timeoutId);
    throw new Error('Failed to fetch URL');
  }

  if (!response.ok) {
    throw new Error('Failed to fetch URL');
  }

  const html = await response.text();
  const root = parse(html);

  const getMetaContent = (property) => {
    const tag = root.querySelector(`meta[property="${property}"]`) || 
                root.querySelector(`meta[name="${property}"]`);
    return tag?.getAttribute('content') || null;
  };

  const getItemprop = (property) => {
    const tag = root.querySelector(`[itemprop="${property}"]`);
    return tag?.getAttribute('content') || tag?.text || null;
  };

  // Extract JSON-LD structured data
  let structuredData = null;
  const jsonLdScripts = root.querySelectorAll('script[type="application/ld+json"]');
  
  for (const script of jsonLdScripts) {
    try {
      const data = JSON.parse(script.text);
      const items = Array.isArray(data) ? data : [data];
      
      for (const item of items) {
        if (item['@type'] === 'Product' || item['@type']?.includes('Product')) {
          structuredData = item;
          break;
        }
      }
      if (structuredData) break;
    } catch (e) {
      // Invalid JSON, skip
    }
  }

  // Extract title
  let title = structuredData?.name || 
              getMetaContent('og:title') ||
              getMetaContent('twitter:title') ||
              getItemprop('name') ||
              root.querySelector('title')?.text ||
              null;
  
  if (title) {
    title = title.replace(/\s*[|\-–—]\s*.{0,50}$/, '').trim();
  }

  // Extract image
  let imageUrl = null;
  if (structuredData?.image) {
    if (typeof structuredData.image === 'string') {
      imageUrl = structuredData.image;
    } else if (Array.isArray(structuredData.image)) {
      imageUrl = structuredData.image[0];
    } else if (structuredData.image.url) {
      imageUrl = structuredData.image.url;
    }
  }
  
  if (!imageUrl) {
    imageUrl = getMetaContent('og:image') ||
               getMetaContent('twitter:image') ||
               getItemprop('image') ||
               null;
  }

  if (imageUrl && !imageUrl.startsWith('http')) {
    try {
      const baseUrl = new URL(url);
      imageUrl = new URL(imageUrl, baseUrl.origin).href;
    } catch (e) {
      imageUrl = null;
    }
  }

  // Extract price
  let price = null;
  if (structuredData?.offers) {
    const offer = Array.isArray(structuredData.offers) 
      ? structuredData.offers[0] 
      : structuredData.offers;
    
    if (offer?.price) {
      price = parseFloat(offer.price);
    } else if (offer?.lowPrice) {
      price = parseFloat(offer.lowPrice);
    }
  }
  
  if (!price) {
    const priceFromMeta = getMetaContent('og:price:amount') || 
                         getMetaContent('product:price:amount') ||
                         getMetaContent('twitter:data1') ||
                         getItemprop('price');
    if (priceFromMeta) {
      price = parseFloat(priceFromMeta.replace(/[^0-9.]/g, ''));
    }
  }
  
  if (price && !isNaN(price)) {
    price = Math.round(price * 100);
  } else {
    price = null;
  }

  // Extract category
  let category = structuredData?.category || null;
  
  if (!category) {
    try {
      const urlPath = new URL(url).pathname;
      const segments = urlPath.split('/').filter(s => s && s.length > 2);
      
      if (segments.length > 0) {
        const firstSegment = segments[0]
          .replace(/[-_]/g, ' ')
          .replace(/\b\w/g, l => l.toUpperCase());
        
        const ignoredSegments = ['products', 'product', 'shop', 'store', 'item', 'p', 'dp'];
        if (!ignoredSegments.includes(segments[0].toLowerCase())) {
          category = firstSegment;
        }
      }
    } catch (e) {
      // Invalid URL parsing, skip
    }
  }

  // Extract description
  const description = getMetaContent('og:description') || 
                     getMetaContent('twitter:description') ||
                     getMetaContent('description') ||
                     getItemprop('description') ||
                     structuredData?.description ||
                     null;

  return {
    title: title ? sanitizeHtml(title).substring(0, 200) : null,
    imageUrl: imageUrl && imageUrl.startsWith('http') ? imageUrl : null,
    price: price,
    category: category ? sanitizeHtml(category).substring(0, 50) : null,
    description: description ? sanitizeHtml(description).substring(0, 500) : null
  };
}

// POST /api/items/preview - Preview URL metadata
router.post('/preview', requireAuth, previewRateLimiter, async (req, res) => {
  try {
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

    let metadata = null;
    let usedFallback = false;

    // PRIMARY: Try Microlink API (50k free requests/month)
    try {
      const microlinkUrl = `https://api.microlink.io?url=${encodeURIComponent(url)}&meta=true&waitFor=5000&screenshot=false`;
      const microlinkResponse = await fetch(microlinkUrl, {
        headers: process.env.MICROLINK_API_KEY ? {
          'x-api-key': process.env.MICROLINK_API_KEY
        } : {},
        signal: AbortSignal.timeout(15000) // 15 second timeout for slow sites
      });

      if (microlinkResponse.ok) {
        const microlinkData = await microlinkResponse.json();
        
        if (microlinkData.status === 'success' && microlinkData.data) {
          const data = microlinkData.data;
          
          // Extract price from Microlink data
          let price = null;
          if (data.price) {
            // Microlink sometimes returns price with currency symbol
            const priceStr = typeof data.price === 'string' 
              ? data.price.replace(/[^0-9.]/g, '') 
              : data.price;
            const priceVal = parseFloat(priceStr);
            if (!isNaN(priceVal) && priceVal > 0 && priceVal < 1000000) {
              price = Math.round(priceVal * 100);
            }
          }

          // Extract category from URL or title
          let category = null;
          try {
            const urlPath = new URL(url).pathname;
            const segments = urlPath.split('/').filter(s => s && s.length > 2);
            
            if (segments.length > 0) {
              const firstSegment = segments[0]
                .replace(/[-_]/g, ' ')
                .replace(/\b\w/g, l => l.toUpperCase());
              
              const ignoredSegments = ['products', 'product', 'shop', 'store', 'item', 'p', 'dp'];
              if (!ignoredSegments.includes(segments[0].toLowerCase())) {
                category = firstSegment;
              }
            }
          } catch (e) {
            // Invalid URL parsing, skip
          }

          metadata = {
            title: data.title ? sanitizeHtml(data.title).substring(0, 200) : null,
            imageUrl: data.image?.url || data.logo?.url || null,
            price: price,
            category: category ? sanitizeHtml(category).substring(0, 50) : null,
            description: data.description ? sanitizeHtml(data.description).substring(0, 500) : null
          };
          
          console.log('✓ Microlink API success for:', url);
        }
      }
    } catch (microlinkError) {
      console.log('Microlink API failed, using fallback:', microlinkError.message);
      usedFallback = true;
    }

    // FALLBACK: Use local HTML scraping if Microlink failed
    if (!metadata) {
      usedFallback = true;
      try {
        metadata = await extractMetadataFromHTML(url);
        console.log('✓ Local scraping success for:', url);
      } catch (fallbackError) {
        console.error('Both Microlink and local scraping failed:', fallbackError.message);
        return res.status(400).json(createErrorResponse(400, 'Failed to extract metadata from URL'));
      }
    }

    return res.status(200).json(createSuccessResponse({
      metadata,
      url,
      source: usedFallback ? 'local' : 'microlink' // For debugging
    }));

  } catch (error) {
    console.error('Preview URL error:', error);
    return res.status(500).json(createErrorResponse(500, 'Internal server error'));
  }
});

// POST /api/items - Create a new item
router.post('/', requireAuth, generalRateLimiter, async (req, res) => {
  try {
    // Validate input
    const validation = validate(createItemSchema, req.body);
    if (!validation.success) {
      return res.status(400).json(createErrorResponse(400, 'Invalid input', validation.errors));
    }

    const itemData = validation.data;

    // Connect to database
    const { db } = await connectToDatabase();
    const listsCollection = db.collection('lists');
    const itemsCollection = db.collection('items');

    // Verify list ownership
    const list = await listsCollection.findOne({ 
      _id: new ObjectId(itemData.listId),
      ownerId: req.user.userId 
    });

    if (!list) {
      return res.status(404).json(createErrorResponse(404, 'List not found'));
    }

    // Create item
    const newItem = {
      ...itemData,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await itemsCollection.insertOne(newItem);

    return res.status(201).json(createSuccessResponse({
      item: {
        id: result.insertedId.toString(),
        listId: newItem.listId,
        title: newItem.title,
        url: newItem.url,
        price: newItem.price,
        imageUrl: newItem.imageUrl,
        category: newItem.category,
        priority: newItem.priority,
        notes: newItem.notes,
        createdAt: newItem.createdAt,
        updatedAt: newItem.updatedAt
      }
    }, 201));

  } catch (error) {
    console.error('Create item error:', error);
    return res.status(500).json(createErrorResponse(500, 'Internal server error'));
  }
});

// PATCH /api/items/:id - Update an item
router.patch('/:id', requireAuth, generalRateLimiter, async (req, res) => {
  try {
    const { id } = req.params;

    // Validate item ID
    const idValidation = validate(objectIdSchema, id);
    if (!idValidation.success) {
      return res.status(400).json(createErrorResponse(400, 'Invalid item ID'));
    }

    // Validate input
    const validation = validate(updateItemSchema, req.body);
    if (!validation.success) {
      return res.status(400).json(createErrorResponse(400, 'Invalid input', validation.errors));
    }

    // Connect to database
    const { db } = await connectToDatabase();
    const listsCollection = db.collection('lists');
    const itemsCollection = db.collection('items');

    // Get item and verify ownership through list
    const item = await itemsCollection.findOne({ _id: new ObjectId(id) });
    if (!item) {
      return res.status(404).json(createErrorResponse(404, 'Item not found'));
    }

    const list = await listsCollection.findOne({ 
      _id: new ObjectId(item.listId),
      ownerId: req.user.userId 
    });

    if (!list) {
      return res.status(403).json(createErrorResponse(403, 'Access denied'));
    }

    // Update item
    const updates = {
      ...validation.data,
      updatedAt: new Date()
    };

    await itemsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updates }
    );

    const updatedItem = await itemsCollection.findOne({ _id: new ObjectId(id) });

    return res.status(200).json(createSuccessResponse({
      item: {
        id: updatedItem._id.toString(),
        listId: updatedItem.listId,
        title: updatedItem.title,
        url: updatedItem.url,
        price: updatedItem.price,
        imageUrl: updatedItem.imageUrl,
        category: updatedItem.category,
        priority: updatedItem.priority,
        notes: updatedItem.notes,
        createdAt: updatedItem.createdAt,
        updatedAt: updatedItem.updatedAt
      }
    }));

  } catch (error) {
    console.error('Update item error:', error);
    return res.status(500).json(createErrorResponse(500, 'Internal server error'));
  }
});

// DELETE /api/items/:id - Delete an item
router.delete('/:id', requireAuth, generalRateLimiter, async (req, res) => {
  try {
    const { id } = req.params;

    // Validate item ID
    const idValidation = validate(objectIdSchema, id);
    if (!idValidation.success) {
      return res.status(400).json(createErrorResponse(400, 'Invalid item ID'));
    }

    // Connect to database
    const { db } = await connectToDatabase();
    const listsCollection = db.collection('lists');
    const itemsCollection = db.collection('items');
    const claimsCollection = db.collection('claims');

    // Get item and verify ownership through list
    const item = await itemsCollection.findOne({ _id: new ObjectId(id) });
    if (!item) {
      return res.status(404).json(createErrorResponse(404, 'Item not found'));
    }

    const list = await listsCollection.findOne({ 
      _id: new ObjectId(item.listId),
      ownerId: req.user.userId 
    });

    if (!list) {
      return res.status(403).json(createErrorResponse(403, 'Access denied'));
    }

    // Delete associated claims first
    await claimsCollection.deleteMany({ itemId: id });

    // Delete item
    await itemsCollection.deleteOne({ _id: new ObjectId(id) });

    return res.status(200).json(createSuccessResponse({
      message: 'Item deleted successfully'
    }));

  } catch (error) {
    console.error('Delete item error:', error);
    return res.status(500).json(createErrorResponse(500, 'Internal server error'));
  }
});

export default router;

