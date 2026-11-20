import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { createSticker } from '../../utils/stickerUtils.js';
import logger from '../../utils/logger.js';

/**
 * Sticker Creator Command
 * Converts an attached or quoted/tagged image or GIF into a sticker.
 * Supports setting sticker caption/name if text is provided after command.
 *
 * Usage:
 * - Direct attachment: send image/gif with caption "s" or "s <caption text>"
 * - Quoted/tagged message: reply to image/gif with "s" or "s <caption text>"
 */
export default {
  name: 's',
  description: 'Convert attached or tagged image/GIF into a sticker',
  aliases: ['sticker', 'stiker'],
  category: 'utility',

  /**
   * Executes the sticker command.
   * @param {object} ctx - Execution context
   */
  async execute(ctx) {
    const { sock, msg, remoteJid, args, reply } = ctx;

    try {
      // 1. Locate target message containing media (either the message itself or quoted message)
      const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      
      let targetMessage = msg;
      let isQuoted = false;

      if (quoted) {
        targetMessage = { message: quoted };
        isQuoted = true;
      }

      const mediaMessage = targetMessage.message;
      const imageMsg = mediaMessage?.imageMessage;
      const videoMsg = mediaMessage?.videoMessage;

      if (!imageMsg && !videoMsg) {
        return await reply(
          '⚠️ *Please send or reply to an image or GIF/video with `s`!*\n\n' +
          '📌 *Examples:*\n' +
          '• Send an image/GIF with caption: `s` or `s Netzee`\n' +
          '• Reply to an image/GIF with: `s` or `s Netzee`'
        );
      }

      // Check if video message is actually a GIF or short video
      let isAnimated = false;
      if (videoMsg) {
        // WhatsApp stores GIFs as videoMessage with gifPlayback: true or short duration
        isAnimated = true;
        if (videoMsg.seconds && videoMsg.seconds > 10) {
          return await reply('❌ *Video is too long!* Please use a GIF or short video (under 10 seconds).');
        }
      }

      // Send processing reaction
      await sock.sendMessage(remoteJid, { react: { text: "⏳", key: msg.key } });

      // 2. Download media buffer from WhatsApp
      const downloadMsg = isQuoted ? { message: quoted } : msg;
      const buffer = await downloadMediaMessage(
        downloadMsg,
        'buffer',
        {},
        {
          logger,
          reuploadRequest: sock.updateMediaMessage
        }
      );

      if (!buffer) {
        return await reply('❌ *Failed to download media file. Please try again.*');
      }

      // 3. Extract caption string (sticker name) if provided
      const stickerCaption = args.join(' ').trim();
      const packName = stickerCaption ? stickerCaption : 'Netzee Bot';
      const authorName = stickerCaption ? 'Netzee' : '';

      // 4. Create WebP sticker buffer
      const stickerBuffer = await createSticker(buffer, isAnimated, packName, authorName);

      // 5. Send sticker back to chat
      await sock.sendMessage(
        remoteJid,
        { sticker: stickerBuffer },
        { quoted: msg }
      );

      // Send success reaction
      await sock.sendMessage(remoteJid, { react: { text: "✅", key: msg.key } });

    } catch (err) {
      logger.error({ err }, 'Error in sticker command execution');
      await reply(`❌ *Failed to create sticker:* ${err.message || 'Unknown error'}`);
    }
  }
};
