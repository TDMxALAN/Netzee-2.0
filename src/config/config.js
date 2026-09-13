import dotenv from 'dotenv';

// Load environment variables from .env if present
dotenv.config();

/**
 * Global Configuration for Netzee WhatsApp Bot
 * All configurable parameters are centralized here with clear defaults.
 */
export const config = {
  // Railway dynamic port or fallback 3000
  port: process.env.PORT || 3000,
  
  // Bot identity & owner info
  botName: process.env.BOT_NAME || 'Netzee Bot',
  ownerNumber: process.env.OWNER_NUMBER || '94722666467',
  
  // Default prefix settings
  defaultPrefix: process.env.DEFAULT_PREFIX || '!',
  
  // Allowed prefixes for Group chats (as per requirement: strictly ! or .)
  groupPrefixes: ['!', '.'],
  
  // Default Country Code for local number formats starting with '0' (e.g., 0722666467 -> +94722666467)
  defaultCountryCode: process.env.DEFAULT_COUNTRY_CODE || '94',
  
  // Session directory path
  sessionDir: './auth_info_baileys'
};

export default config;
