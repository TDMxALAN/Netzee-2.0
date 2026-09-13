import { removeWords } from '../../utils/filterStore.js';
import { getBotAdminStatus, isSenderAdmin } from '../../utils/groupUtils.js';

/**
 * !unban Command
 * Removes one or more words from the group's banned-word filter list.
 * Usage: !unban word1, word2, word3
 *
 * Requirements:
 *  - Must be used in a group chat
 *  - Sender must be a group admin
 *  - Bot must be a group admin
 */
export default {
  name: 'unban',
  description: 'Remove words from the group banned-word filter list',
  aliases: [],
  category: 'moderation',

  async execute(ctx) {
    const { sock, msg, remoteJid, isGroup, args, reply } = ctx;

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
    const senderJid = msg.key.participant || msg.participant || remoteJid;
    if (!isSenderAdmin(metadata, senderJid)) {
      return await reply('🚫 Only *group admins* can modify the banned word list.');
    }

    // ── Parse words (comma-separated) ──
    if (args.length === 0) {
      return await reply(
        `❌ *No words provided.*\n\n` +
        `*Usage:* \`!unban word1, word2, word3\``
      );
    }

    const rawInput = args.join(' ');
    const words = rawInput
      .split(',')
      .map(w => w.trim())
      .filter(Boolean);

    if (words.length === 0) {
      return await reply('❌ Could not parse any words. Use comma-separated values.');
    }

    const removed = removeWords(remoteJid, words);

    if (removed.length === 0) {
      const formatted = words.map(w => `\`${w}\``).join(', ');
      return await reply(
        `ℹ️ None of the provided words were in the banned list:\n${formatted}`
      );
    }

    const formatted = removed.map(w => `\`${w}\``).join(', ');
    await reply(
      `✅ *Word Filter Updated*\n\n` +
      `✔️ *Words removed from banned list (${removed.length}):*\n${formatted}`
    );
  }
};
