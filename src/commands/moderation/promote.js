import { parsePhoneNumber } from '../../utils/phoneUtils.js';
import { canManageAdmins, promoteAdmin } from '../../utils/adminStore.js';

/**
 * promote Command
 * Promotes a user to bot admin.
 *
 * Usage (groups or DM):
 *   .promote +94722666467
 *   .promote 94722666467
 *   .promote 0722666467
 *
 * Authorization:
 *   Only the super admin (+94722666467) or the bot's own number can run this.
 *
 * Rules:
 *   - Cannot promote the super admin (they're already super admin).
 *   - Cannot create more super admins.
 */
export default {
  name: 'promote',
  description: 'Promote a phone number to bot admin',
  aliases: [],
  category: 'moderation',

  async execute(ctx) {
    const { sock, msg, remoteJid, args, reply } = ctx;

    // ── Determine sender JID ──────────────────────────────────────────────────
    const isGroup = remoteJid.endsWith('@g.us');
    const senderJid = isGroup
      ? (msg.key.participant || msg.participant || remoteJid)
      : remoteJid;

    // ── Authorization check ──────────────────────────────────────────────────
    const botJid = sock.user?.id || null;
    if (!canManageAdmins(senderJid, botJid)) {
      return await reply(
        '🚫 *Unauthorized.*\n' +
        'Only the *super admin* or the *bot itself* can promote admins.'
      );
    }

    // ── Require a phone number argument ──────────────────────────────────────
    if (args.length === 0) {
      return await reply(
        '❌ *No number provided.*\n\n' +
        '*Usage:* `.promote <number>`\n\n' +
        '*Accepted formats:*\n' +
        '  • `+94 72 266 6467`\n' +
        '  • `94722666467`\n' +
        '  • `0722666467`'
      );
    }

    // ── Parse & validate the phone number ────────────────────────────────────
    const rawInput = args.join(' ');
    const parsed = parsePhoneNumber(rawInput);

    if (!parsed.isValid) {
      return await reply(
        `❌ *Invalid phone number:* \`${rawInput}\`\n\n` +
        '*Accepted formats:*\n' +
        '  • `+94 72 266 6467`\n' +
        '  • `94722666467`\n' +
        '  • `0722666467`'
      );
    }

    // ── Attempt promotion ─────────────────────────────────────────────────────
    const result = promoteAdmin(parsed.digits);

    switch (result) {
      case 'is_super_admin':
        return await reply(
          `ℹ️ *${parsed.international}* is already the *Super Admin* and cannot be re-promoted.`
        );

      case 'already_admin':
        return await reply(
          `ℹ️ *${parsed.international}* is already a *Bot Admin*.`
        );

      case 'promoted':
        return await reply(
          `✅ *${parsed.international}* has been promoted to *Bot Admin*.\n` +
          `They can now use admin-only bot commands.`
        );

      case 'invalid':
      default:
        return await reply(`❌ Could not process number: \`${rawInput}\``);
    }
  }
};
