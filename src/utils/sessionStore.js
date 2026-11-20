/**
 * sessionStore.js
 * In-memory store for transient bot interaction sessions.
 *
 * Currently used by the word-filter feature to track which groups have an
 * active "banned list" message so that numbered replies can be processed.
 *
 * Structure:
 * {
 *   "<groupJid>": {
 *     bannedListMsgId: string,   // messageID of the last !banned list sent
 *     timestamp: number          // epoch ms — used for optional future TTL
 *   }
 * }
 */

const sessions = new Map();

/**
 * Store a banned-list session for a group.
 * Replaces any previously active session for that group.
 * @param {string} groupJid
 * @param {string} messageId  - The ID of the !banned reply message sent by the bot
 */
export function setBannedListSession(groupJid, messageId) {
  sessions.set(groupJid, {
    bannedListMsgId: messageId,
    timestamp: Date.now()
  });
}

/**
 * Retrieve the active banned-list session for a group.
 * @param {string} groupJid
 * @returns {{ bannedListMsgId: string, timestamp: number } | null}
 */
export function getBannedListSession(groupJid) {
  return sessions.get(groupJid) || null;
}

/**
 * Clear the banned-list session for a group.
 * @param {string} groupJid
 */
export function clearBannedListSession(groupJid) {
  sessions.delete(groupJid);
}
