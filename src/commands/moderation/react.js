import { parsePhoneNumber } from '../../utils/phoneUtils.js';
import { isAdmin, isSuperAdmin } from '../../utils/adminStore.js';
import { setReactRule, removeReactRule, getAllReactRules } from '../../utils/reactStore.js';

/**
 * react Command
 * Configures automatic emoji reactions for messages sent by specific phone numbers across any chat.
 *
 * Usage:
 *   .react set <number> - <emoji>
 *   .react set 94722666467 - 🎀
 *   .react set +94 72 266 6467 - ❤️
 *   .react remove <number>
 *   .react remove 94722666467
 *   .react list
 *
 * Authorization:
 *   Only admins configured by bot or superadmin can execute this command.
 */
export default {
  name: 'react',
  description: 'Set or remove auto emoji reactions for specific numbers',
  aliases: [],
  category: 'moderation',

  async execute(ctx) {
    const { msg, remoteJid, args, reply } = ctx;

    // ── Determine sender JID ──────────────────────────────────────────────────
    const isGroup = remoteJid.endsWith('@g.us');
    const senderJid = isGroup
      ? (msg.key.participant || msg.participant || remoteJid)
      : remoteJid;

    // ── Authorization check: Bot Admin or Super Admin only ──────────────────
    //!edited by user
    if (!isAdmin(senderJid) || !isSuperAdmin(senderJid)) {
      return await reply(
        '🚫 *Unauthorized.*\n' +
        'This command is restricted to *Bot Admins* and the *Super Admin*.'
      );
    }

    if (args.length === 0) {
      return await reply(
        '❓ *Usage instructions for `.react`:*\n\n' +
        '🔹 *To set auto reaction:*\n' +
        '`.react set <number> - <emoji>`\n' +
        'Example: `.react set 94722666467 - 🎀`\n\n' +
        '🔹 *To remove auto reaction:*\n' +
        '`.react remove <number>`\n' +
        'Example: `.react remove 94722666467`\n\n' +
        '🔹 *To list active reactions:*\n' +
        '`.react list`\n\n' +
        '*Supported number formats:*\n' +
        '  • `+94 72 266 6467`\n' +
        '  • `94722666467`\n' +
        '  • `0722666467`'
      );
    }

    const subCommand = args[0].toLowerCase();

    // ── 1. Subcommand: SET ────────────────────────────────────────────────────
    if (subCommand === 'set') {
      const fullSetInput = args.slice(1).join(' ');

      // Parse format: <number> - <emoji>
      const dashIndex = fullSetInput.indexOf('-');
      if (dashIndex === -1) {
        return await reply(
          '❌ *Invalid format.*\n\n' +
          'Please use: `.react set <number> - <emoji>`\n' +
          'Example: `.react set 94722666467 - 🎀`'
        );
      }

      const rawNumber = fullSetInput.slice(0, dashIndex).trim();
      const emoji = fullSetInput.slice(dashIndex + 1).trim();

      if (!rawNumber) {
        return await reply('❌ Please provide a phone number.');
      }
      if (!emoji) {
        return await reply('❌ Please provide an emoji to react with.');
      }

      const res = setReactRule(rawNumber, emoji);
      if (!res.success) {
        return await reply(
          `❌ *Invalid phone number:* \`${rawNumber}\`\n\n` +
          '*Accepted formats:*\n' +
          '  • `+94 72 266 6467`\n' +
          '  • `94722666467`\n' +
          '  • `0722666467`'
        );
      }

      return await reply(
        `✅ *Auto Reaction Set!*\n\n` +
        `👤 *Target Number:* \`${res.parsedNumber}\`\n` +
        `🎀 *Emoji:* ${res.emoji}\n\n` +
        `The bot will now react to every message sent by this number in any chat.`
      );
    }

    // ── 2. Subcommand: REMOVE ─────────────────────────────────────────────────
    if (subCommand === 'remove') {
      const rawNumber = args.slice(1).join(' ').trim();
      if (!rawNumber) {
        return await reply(
          '❌ *No number provided.*\n\n' +
          '*Usage:* `.react remove <number>`\n' +
          'Example: `.react remove 94722666467`'
        );
      }

      const res = removeReactRule(rawNumber);
      if (!res.success) {
        if (res.error === 'invalid_number') {
          return await reply(
            `❌ *Invalid phone number:* \`${rawNumber}\`\n\n` +
            '*Accepted formats:*\n' +
            '  • `+94 72 266 6467`\n' +
            '  • `94722666467`\n' +
            '  • `0722666467`'
          );
        } else if (res.error === 'not_found') {
          return await reply(
            `ℹ️ No active auto reaction rule found for \`${res.parsedNumber || rawNumber}\`.`
          );
        }
      }

      return await reply(
        `✅ *Auto Reaction Removed!*\n\n` +
        `👤 *Target Number:* \`${res.parsedNumber}\`\n` +
        `The bot will no longer auto react to messages from this number.`
      );
    }

    // ── 3. Subcommand: LIST ───────────────────────────────────────────────────
    if (subCommand === 'list') {
      const rules = getAllReactRules();
      const numbers = Object.keys(rules);

      if (numbers.length === 0) {
        return await reply('📋 No auto reaction rules currently set.');
      }

      const formattedRules = numbers
        .map((num, i) => `${i + 1}. \`+${num}\` ➔ ${rules[num]}`)
        .join('\n');

      return await reply(
        `📋 *Active Auto Reaction Rules (${numbers.length}):*\n\n${formattedRules}`
      );
    }

    // Unknown subcommand fallback
    return await reply(
      `❌ Unknown action \`${subCommand}\`.\n` +
      'Use `.react set <number> - <emoji>` or `.react remove <number>`.'
    );
  }
};
