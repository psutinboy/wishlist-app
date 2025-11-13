import { initializeIndexes } from './_db.js';

/**
 * Initialize database indexes
 * Run this script once to set up the database
 */
async function main() {
  try {
    console.log('Initializing database indexes...');
    await initializeIndexes();
    console.log('Database initialization complete!');
    process.exit(0);
  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exit(1);
  }
}

main();

