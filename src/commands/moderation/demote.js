import { parsePhoneNumber } from '../../utils/phoneUtils.js';
import { canManageAdmins, demoteAdmin } from '../../utils/adminStore.js';

/**
 * demote Command
 * Removes a user from the bot admin list.
 *
 * Usage (groups or DM):
 *   .demote +94722666467
 *   .demote 94722666467
 *   .demote 0722666467
 *
 * Authorization:
 *   Only the super admin (+94722666467) or the bot's own number can run this.
 *
 * Rules:
 *   - Cannot demote the super admin (they are permanent).
 *   - Cannot remove someone who is not currently a bot admin.
 */
export default {
  name: 'demote',
  description: 'Demote a bot admin back to regular user',
  aliases: [],
  category: 'moderation',

  async execute(ctx) {
    const { sock, msg, remoteJid, args, reply } = ctx;

    // ── Determine sender JID ──────────────────────────────────────────────────
    const isGroup = remoteJid.endsWith('@g.us');
    const senderJid = ctx.senderJid || (msg.key.fromMe
      ? (sock?.user?.id || msg.key.participant || remoteJid)
      : (isGroup ? (msg.key.participant || msg.participant || remoteJid) : remoteJid));

    // ── Authorization check ──────────────────────────────────────────────────
    const botJid = sock.user?.id || null;
    if (!canManageAdmins(senderJid, botJid)) {
      return await reply(
        '🚫 *Unauthorized.*\n' +
        'Only the *super admin* or the *bot itself* can demote admins.'
      );
    }

    // ── Require a phone number argument ──────────────────────────────────────
    if (args.length === 0) {
      return await reply(
        '❌ *No number provided.*\n\n' +
        '*Usage:* `.demote <number>`\n\n' +
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

    // ── Attempt demotion ──────────────────────────────────────────────────────
    const result = demoteAdmin(parsed.digits);

    switch (result) {
      case 'is_super_admin':
        return await reply(
          `🔒 *${parsed.international}* is the *Super Admin* and cannot be demoted.`
        );

      case 'not_admin':
        return await reply(
          `ℹ️ *${parsed.international}* is not currently a *Bot Admin*.`
        );

      case 'demoted':
        return await reply(
          `✅ *${parsed.international}* has been removed from *Bot Admin*.\n` +
          `They no longer have admin-level bot access.`
        );

      case 'invalid':
      default:
        return await reply(`❌ Could not process number: \`${rawInput}\``);
    }
  }
};
