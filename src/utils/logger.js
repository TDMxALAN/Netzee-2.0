import pino from 'pino';

/**
 * Custom Pino Logger instance.
 * Used across the bot to log connection states, command executions, and errors clearly.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  timestamp: pino.stdTimeFunctions.isoTime
}).child({ stream: 'whatsapp-bot' });

// Silent logger option specifically for Baileys to suppress noisy internal protocol logs
export const baileysLogger = pino({ level: 'silent' });

export default logger;

