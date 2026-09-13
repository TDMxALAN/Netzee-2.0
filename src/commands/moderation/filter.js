import { setFilterEnabled, getFilterConfig } from '../../utils/filterStore.js';
import { getBotAdminStatus, isSenderAdmin } from '../../utils/groupUtils.js';

/**
 * !filter Command
 * Turns the word filter on or off for the group.
 * Usage: !filter on | !filter off
 *
 * Requirements:
 *  - Must be used in a group chat
 *  - Sender must be a group admin
 *  - Bot must be a group admin
 */
export default {
  name: 'filter',
  description: 'Turn the word filter on or off for this group',
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
      return await reply('🚫 Only *group admins* can toggle the word filter.');
    }

    const subCommand = (args[0] || '').toLowerCase();

    if (subCommand !== 'on' && subCommand !== 'off') {
      const { enabled, words } = getFilterConfig(remoteJid);
      return await reply(
        `⚙️ *Word Filter*\n\n` +
        `Current Status: *${enabled ? '🟢 ON' : '🔴 OFF'}*\n` +
        `Banned words: *${words.length}*\n\n` +
        `*Usage:*\n` +
        `  \`!filter on\`  — Enable the filter\n` +
        `  \`!filter off\` — Disable the filter`
      );
    }

    const enable = subCommand === 'on';
    setFilterEnabled(remoteJid, enable);

    if (enable) {
      const { words } = getFilterConfig(remoteJid);
      await reply(
        `🟢 *Word Filter Enabled*\n\n` +
        `The bot will now delete messages containing banned words.\n` +
        `Active banned words: *${words.length}*\n\n` +
        `Use \`!banned\` to view the full list.`
      );
    } else {
      await reply(
        `🔴 *Word Filter Disabled*\n\n` +
        `The bot will no longer filter messages.\n` +
        `The banned word list is preserved — use \`!filter on\` to re-enable.`
      );
    }
  }
};
