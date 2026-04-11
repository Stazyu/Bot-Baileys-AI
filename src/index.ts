import dotenv from 'dotenv';
import { createSessionWithHandler, loadActiveSessions, disconnectAllSessions, getAllSessions } from './session/sessionHelper.js';

// Set console encoding to UTF-8 for emoji support on Windows
if (process.platform === 'win32') {
  process.stdout.setEncoding('utf-8');
  process.stderr.setEncoding('utf-8');
}

// Load environment variables
dotenv.config();

async function main() {
  console.log('🚀 Starting Bot-Baileys-AI...');

  // Check if DATABASE_URL is set
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is not set in environment variables');
    process.exit(1);
  }

  // Load active sessions from database with handlers
  await loadActiveSessions();

  // Get command line arguments for creating new sessions
  const args = process.argv.slice(2);
  const newSessionId = args.find(arg => arg.startsWith('--session='))?.split('=')[1];
  const forceClear = args.includes('--force-clear');

  if (newSessionId) {
    await createSessionWithHandler(newSessionId, forceClear);
  } else {
    // Check if there are any active sessions
    const sessions = await getAllSessions();
    if (sessions.size === 0) {
      console.log('ℹ️  No active sessions found. Creating default session...');
      await createSessionWithHandler('default');
    } else {
      console.log('ℹ️  No new session specified. Using existing sessions...');
    }
  }

  console.log('✅ Bot is running!');
  console.log('💡 Use --session=<session-id> to create a new session');
  console.log('💡 Press Ctrl+C to stop the bot');

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down bot...');
    await disconnectAllSessions();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n🛑 Shutting down bot...');
    await disconnectAllSessions();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
