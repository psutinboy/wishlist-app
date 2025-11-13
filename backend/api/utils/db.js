import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

let cachedClient = null;
let cachedDb = null;

/**
 * Connect to MongoDB with connection caching
 * @returns {Promise<{client: MongoClient, db: Db}>}
 */
export async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI environment variable is not defined');
  }

  const client = await MongoClient.connect(process.env.MONGODB_URI, {
    maxPoolSize: 10,
    minPoolSize: 1,
  });

  const db = client.db(process.env.MONGODB_DB_NAME || 'wishlist');

  cachedClient = client;
  cachedDb = db;

  return { client, db };
}

/**
 * Initialize database indexes
 * Should be run once during deployment or setup
 */
export async function initializeIndexes() {
  const { db } = await connectToDatabase();

  try {
    // Users collection indexes
    await db.collection('users').createIndex({ email: 1 }, { unique: true });

    // Lists collection indexes
    await db.collection('lists').createIndex({ ownerId: 1 });
    await db.collection('lists').createIndex({ shareId: 1 }, { unique: true });

    // Items collection indexes
    await db.collection('items').createIndex({ listId: 1 });

    // Claims collection indexes
    await db.collection('claims').createIndex({ itemId: 1 });
    await db.collection('claims').createIndex({ secretToken: 1 }, { unique: true });

    console.log('Database indexes created successfully');
    return { success: true };
  } catch (error) {
    console.error('Error creating indexes:', error);
    throw error;
  }
}

