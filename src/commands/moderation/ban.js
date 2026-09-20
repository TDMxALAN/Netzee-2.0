import { addWords } from '../../utils/filterStore.js';
import { getBotAdminStatus, isSenderAdmin } from '../../utils/groupUtils.js';

/**
 * !ban Command
 * Adds one or more words to the group's banned-word filter list.
 * Usage: !ban word1, word2, word3
 *
 * Requirements:
 *  - Must be used in a group chat
 *  - Sender must be a group admin
 *  - Bot must be a group admin
 */
export default {
  name: 'ban',
  description: 'Add words to the group banned-word filter list',
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
    const senderJid = ctx.senderJid || msg.key.participant || msg.participant || remoteJid;
    if (!isSenderAdmin(metadata, senderJid)) {
      return await reply('🚫 Only *group admins* can modify the banned word list.');
    }

    // ── Parse words (comma-separated) ──
    if (args.length === 0) {
      return await reply(
        `❌ *No words provided.*\n\n` +
        `*Usage:* \`!ban word1, word2, word3\``
      );
    }

    // Re-join args then split by comma
    const rawInput = args.join(' ');
    const words = rawInput
      .split(',')
      .map(w => w.trim())
      .filter(Boolean);

    if (words.length === 0) {
      return await reply('❌ Could not parse any words. Use comma-separated values.');
    }

    const added = addWords(remoteJid, words);

    if (added.length === 0) {
      const formatted = words.map(w => `\`${w}\``).join(', ');
      return await reply(
        `ℹ️ All provided words are already in the banned list:\n${formatted}`
      );
    }

    const formatted = added.map(w => `\`${w}\``).join(', ');
    await reply(
      `✅ *Word Filter Updated*\n\n` +
      `🚫 *Banned words added (${added.length}):*\n${formatted}\n\n` +
      `🔴 Filter is now *ON* for this group.`
    );
  }
};
