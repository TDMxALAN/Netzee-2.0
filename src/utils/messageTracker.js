/**
 * messageTracker.js
 * Tracks message IDs sent programmatically by the bot's WASocket instance.
 * Used to distinguish automated messages sent by the bot code (replies, reactions, media)
 * from messages sent by the user/owner from their own WhatsApp phone/web/desktop.
 */

const botSentMessageIds = new Set();

/**
 * Register a message ID as being sent programmatically by the bot.
 * Automatically clears after TTL (2 minutes).
 * @param {string} messageId
 */
export function registerBotMessage(messageId) {
  if (!messageId) return;
  botSentMessageIds.add(messageId);
  setTimeout(() => {
    botSentMessageIds.delete(messageId);
  }, 120000);
}

/**
 * Check if a message ID was sent programmatically by the bot.
 * If true, deletes it from the set and returns true.
 * @param {string} messageId
 * @returns {boolean}
 */
export function isBotSentMessage(messageId) {
  if (!messageId) return false;
  if (botSentMessageIds.has(messageId)) {
    botSentMessageIds.delete(messageId);
    return true;
  }
  return false;
}

export default {
  registerBotMessage,
  isBotSentMessage
};
