import { z } from 'zod';

/**
 * Zod validation schemas for all API endpoints
 */

// Common schemas
export const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId format');

export const urlSchema = z.string().url().startsWith('https://', 'URL must use HTTPS');

export const emailSchema = z.string().email().max(255);

export const passwordSchema = z.string().min(8).max(128);

// Auth schemas
export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().min(1).max(100).trim()
});

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema
});

// List schemas
export const createListSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  isPublic: z.boolean().optional().default(true)
});

export const updateListSchema = z.object({
  title: z.string().min(1).max(200).trim().optional(),
  isPublic: z.boolean().optional()
});

// Item schemas
export const createItemSchema = z.object({
  listId: objectIdSchema,
  title: z.string().min(1).max(200).trim(),
  url: urlSchema.optional(),
  price: z.number().int().min(0).optional(), // Price in cents
  imageUrl: urlSchema.optional(),
  category: z.string().max(50).trim().optional(),
  priority: z.enum(['high', 'medium', 'low']).optional().default('medium'),
  notes: z.string().max(500).trim().optional()
});

export const updateItemSchema = z.object({
  title: z.string().min(1).max(200).trim().optional(),
  url: urlSchema.optional(),
  price: z.number().int().min(0).optional(),
  imageUrl: urlSchema.optional(),
  category: z.string().max(50).trim().optional(),
  priority: z.enum(['high', 'medium', 'low']).optional(),
  notes: z.string().max(500).trim().optional()
});

export const previewUrlSchema = z.object({
  url: urlSchema
});

// Claim schemas
export const createClaimSchema = z.object({
  itemId: objectIdSchema,
  claimerName: z.string().min(1).max(100).trim(),
  claimerNote: z.string().max(200).trim().optional()
});

export const deleteClaimSchema = z.object({
  token: z.string().min(10)
});

// User settings schemas
export const updateSettingsSchema = z.object({
  email: emailSchema.optional(),
  currentPassword: passwordSchema.optional(),
  newPassword: passwordSchema.optional(),
  displayName: z.string().min(1).max(100).trim().optional(),
  preferences: z.object({
    defaultListVisibility: z.boolean().optional(),
    theme: z.enum(['light', 'dark', 'system']).optional(),
    allowClaimsByDefault: z.boolean().optional()
  }).optional()
}).refine(
  (data) => {
    // If newPassword is provided, currentPassword must also be provided
    if (data.newPassword && !data.currentPassword) {
      return false;
    }
    return true;
  },
  {
    message: 'Current password required when changing password',
    path: ['currentPassword']
  }
);

export const deleteAccountSchema = z.object({
  password: passwordSchema,
  confirmation: z.literal('DELETE')
});

/**
 * Validate data against a schema
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @param {any} data - Data to validate
 * @returns {{success: boolean, data?: any, errors?: any}}
 */
export function validate(schema, data) {
  try {
    const validated = schema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    return { success: false, errors: error.errors };
  }
}

