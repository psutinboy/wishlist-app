// Database initialization script
// Run this once to create MongoDB indexes
import { initializeIndexes } from './api/utils/db.js';
import dotenv from 'dotenv';

dotenv.config();

async function init() {
  try {
    console.log('Initializing database indexes...');
    await initializeIndexes();
    console.log('✓ Database initialized successfully');
    process.exit(0);
  } catch (error) {
    console.error('✗ Failed to initialize database:', error);
    process.exit(1);
  }
}

init();

