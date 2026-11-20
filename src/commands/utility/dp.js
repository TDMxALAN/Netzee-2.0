import { parsePhoneNumber } from '../../utils/phoneUtils.js';
import logger from '../../utils/logger.js';

/**
 * Display Picture (DP) Command
 * Fetches and sends the profile display picture of a specified phone number back to the requesting user.
 * Supports numbers formatted as +94 72 266 6467, 94722666467, or 0722666467.
 */
export default {
  name: 'dp',
  description: 'Fetch display picture of a person by phone number',
  aliases: ['pfp', 'profilepic', 'avatar'],
  category: 'utility',

  /**
   * Executes the dp command.
   * @param {object} ctx - Execution context containing sock, msg, remoteJid, args, reply
   */
  async execute(ctx) {
    const { sock, msg, remoteJid, args, reply, usedPrefix } = ctx;

    // Check if phone number argument is provided
    if (!args || args.length === 0) {
      return await reply(
        `❌ *Missing Phone Number*\n\n` +
        `Please provide a phone number in any supported format:\n` +
        `• \`+94 72 266 6467\`\n` +
        `• \`94722666467\`\n` +
        `• \`0722666467\`\n\n` +
        `*Example:* \`${usedPrefix || ''}dp 94722666467\``
      );
    }

    // Rejoin arguments to handle inputs with spaces like +94 72 266 6467
    const rawInput = args.join(' ');
    const parsed = parsePhoneNumber(rawInput);

    // Validate phone number format
    if (!parsed.isValid || !parsed.jid) {
      return await reply(
        `❌ *Invalid Phone Number*\n\n` +
        `Input: "${rawInput}"\n` +
        `Please check the digit count and format.`
      );
    }

    try {
      // Send processing reaction
      await sock.sendMessage(remoteJid, { react: { text: "🔍", key: msg.key } });

      // Fetch high resolution profile picture URL from WhatsApp
      const profilePicUrl = await sock.profilePictureUrl(parsed.jid, 'image');

      if (!profilePicUrl) {
        await sock.sendMessage(remoteJid, { react: { text: "❌", key: msg.key } });
        return await reply(`❌ Display picture is unavailable for *${parsed.international}*.`);
      }

      // Send the profile image back to user with caption
      await sock.sendMessage(
        remoteJid,
        {
          image: { url: profilePicUrl },
          caption: `📸 *Display Picture*\n\n👤 *Number:* \`${parsed.international}\`\n🆔 *JID:* \`${parsed.jid}\``
        },
        { quoted: msg }
      );

      // Send success reaction
      await sock.sendMessage(remoteJid, { react: { text: "✅", key: msg.key } });

    } catch (err) {
      logger.warn({ err: err.message, jid: parsed.jid }, 'Profile picture fetch failed or unavailable');

      // Send reaction and unavailable message if privacy settings or missing DP causes error
      await sock.sendMessage(remoteJid, { react: { text: "❌", key: msg.key } });
      return await reply(`❌ Display picture is unavailable for *${parsed.international}*.`);
    }
  }
};
