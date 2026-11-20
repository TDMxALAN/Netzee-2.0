import { parsePhoneNumber } from '../../utils/phoneUtils.js';

/**
 * Check Number Command
 * Validates and converts phone numbers provided in various formats (+94 72 266 6467, 94722666467, 0722666467)
 * into standard international and WhatsApp JID formats.
 */
export default {
  name: 'checknumber',
  description: 'Validate and convert phone numbers into WhatsApp JID format',
  aliases: ['num', 'formatnum', 'parsephone', 'number'],
  category: 'utility',

  /**
   * Executes the checknumber command.
   * @param {object} ctx - Execution context containing args and reply helper
   */
  async execute(ctx) {
    if (!ctx.args || ctx.args.length === 0) {
      return await ctx.reply(
        `❌ *Missing Phone Number*\n\n` +
        `Please provide a phone number in any supported format:\n` +
        `• \`+94 72 266 6467\`\n` +
        `• \`94722666467\`\n` +
        `• \`0722666467\`\n\n` +
        `*Example:* \`${ctx.usedPrefix || '!'}checknumber 0722666467\``
      );
    }

    // Rejoin args to handle spaces in inputs like +94 72 266 6467
    const rawInput = ctx.args.join(' ');
    const parsed = parsePhoneNumber(rawInput);

    if (!parsed.isValid) {
      return await ctx.reply(
        `❌ *Invalid Phone Number*\n\n` +
        `Input: "${rawInput}"\n` +
        `Reason: Could not format or validate as a valid phone number. Check the digit count or country code.`
      );
    }

    const response =
      `📱 *Phone Number Analysis*\n\n` +
      `📥 *Raw Input:* \`${parsed.rawInput}\` \n` +
      `✅ *Validation Status:* Valid\n` +
      `🔢 *Normalized Digits:* \`${parsed.digits}\` \n` +
      `🌍 *International Format:* \`${parsed.international}\` \n` +
      `🆔 *WhatsApp JID:* \`${parsed.jid}\``;

    await ctx.reply(response);
  }
};
