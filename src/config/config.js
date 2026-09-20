import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env if present
dotenv.config();

/**
 * Determines the session directory path:
 * 1. SESSION_DIR environment variable if explicitly defined.
 * 2. /data/session if Railway persistent volume (/data) exists.
 * 3. ./data/session local workspace directory fallback.
 */
function resolveSessionDir() {
  if (process.env.SESSION_DIR) {
    return process.env.SESSION_DIR;
  }
  try {
    if (fs.existsSync('/data')) {
      return '/data/session';
    }
  } catch (e) {
    // Ignore filesystem permission check error fallback
  }
  return './data/session';
}

/**
 * Determines the user data directory path:
 * 1. USERDATA_DIR or DATA_DIR environment variable if explicitly defined.
 * 2. /data/userdata if Railway persistent volume (/data) exists.
 * 3. ./data/userdata local workspace directory fallback.
 */
function resolveUserDataDir() {
  if (process.env.USERDATA_DIR) {
    return process.env.USERDATA_DIR;
  }
  if (process.env.DATA_DIR) {
    return process.env.DATA_DIR;
  }
  try {
    if (fs.existsSync('/data')) {
      return '/data/userdata';
    }
  } catch (e) {
    // Ignore filesystem permission check error fallback
  }
  return './data/userdata';
}

/**
 * Global Configuration for Netzee WhatsApp Bot
 */
export const config = {
  // Railway dynamic port or fallback 3000
  port: process.env.PORT || 3000,
  
  // Bot identity & owner info
  botName: process.env.BOT_NAME || 'Netzee Bot',
  ownerNumber: process.env.OWNER_NUMBER || '94722666467',
  
  // Default prefix settings
  defaultPrefix: process.env.DEFAULT_PREFIX || '!',
  
  // Allowed prefixes for Group chats (strictly ! or .)
  groupPrefixes: ['!', '.'],
  
  // Default Country Code for local number formats starting with '0'
  defaultCountryCode: process.env.DEFAULT_COUNTRY_CODE || '94',
  
  // Persistent Session directory path (/data/session)
  sessionDir: resolveSessionDir(),

  // Persistent User Data directory path (/data/userdata)
  userDataDir: resolveUserDataDir()
};

export default config;
