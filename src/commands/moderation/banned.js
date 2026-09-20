import { getFilterConfig } from '../../utils/filterStore.js';
import { getBotAdminStatus, isSenderAdmin } from '../../utils/groupUtils.js';
import { setBannedListSession } from '../../utils/sessionStore.js';

/**
 * !banned Command
 * Displays the numbered list of currently banned words for this group.
 * Admins can then reply to this message with a number to remove that word.
 *
 * Requirements:
 *  - Must be used in a group chat
 *  - Sender must be a group admin
 *  - Bot must be a group admin
 */
export default {
  name: 'banned',
  description: 'Show the numbered list of banned words for this group',
  aliases: ['banlist', 'wordlist'],
  category: 'moderation',

  async execute(ctx) {
    const { sock, msg, remoteJid, isGroup, reply } = ctx;

    // ── Group-only guard ──
    if (!isGroup) {
      return await reply('❌ This command only works inside group chats.');
    }

    // ── Bot must be admin ──
    const { isAdmin, metadata } = await getBotAdminStatus(sock, remoteJid);
    if (!isAdmin) {
      return await reply(
        '❌ *Bot must be a group admin* to manage the word filter.\n' +
        'Please promote the bot to admin first.'
      );
    }

    // ── Sender must be admin ──
    const senderJid = ctx.senderJid || msg.key.participant || msg.participant || remoteJid;
    if (!isSenderAdmin(metadata, senderJid)) {
      return await reply('🚫 Only *group admins* can view the banned word list.');
    }

    const { enabled, words } = getFilterConfig(remoteJid);

    if (words.length === 0) {
      return await reply(
        `📋 *Banned Word List*\n\n` +
        `The banned word list is currently *empty*.\n` +
        `Use \`!ban word1, word2\` to add words.\n\n` +
        `🔴 Filter: *${enabled ? 'ON' : 'OFF'}*`
      );
    }

    // Build numbered list
    const numberedList = words
      .map((w, i) => `  ${i + 1}. \`${w}\``)
      .join('\n');

    const listText =
      `📋 *Banned Word List* (${words.length} word${words.length === 1 ? '' : 's'})\n` +
      `🔴 Filter: *${enabled ? 'ON' : 'OFF'}*\n\n` +
      `${numberedList}\n\n` +
      `💡 *Reply to this message with a number* to remove that word.\n` +
      `   Example: Reply \`1\` to remove the first word.`;

    // Send the list and capture the sent message ID
    const sentMsg = await sock.sendMessage(remoteJid, { text: listText }, { quoted: msg });

    // Register this message as the active banned-list session for this group.
    // The messageHandler will watch for replies to THIS message ID.
    const sentMsgId = sentMsg?.key?.id;
    if (sentMsgId) {
      setBannedListSession(remoteJid, sentMsgId);
    }
  }
};
