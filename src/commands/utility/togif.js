import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { convertWebpToGif } from '../../utils/stickerUtils.js';
import logger from '../../utils/logger.js';

/**
 * ToGIF Command
 * Converts an attached or tagged .awebp file, animated WebP, sticker, or media into a GIF.
 *
 * Usage:
 * - Direct attachment: send .awebp file / sticker / webp with caption "togif"
 * - Quoted/tagged message: reply to an .awebp file / sticker / webp with "togif"
 */
export default {
  name: 'togif',
  description: 'Convert attached or tagged .awebp file or sticker into a GIF',
  aliases: ['awebptogif', 'stickertogif', 'tomp4'],
  category: 'utility',

  /**
   * Executes the togif command.
   * @param {object} ctx - Execution context
   */
  async execute(ctx) {
    const { sock, msg, remoteJid, reply } = ctx;

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
      const documentMsg = mediaMessage?.documentMessage;
      const stickerMsg = mediaMessage?.stickerMessage;
      const imageMsg = mediaMessage?.imageMessage;
      const videoMsg = mediaMessage?.videoMessage;

      if (!documentMsg && !stickerMsg && !imageMsg && !videoMsg) {
        return await reply(
          '⚠️ *Please send or reply to an .awebp file, sticker, or WebP media with `togif`!*\n\n' +
          '📌 *Examples:*\n' +
          '• Send a `.awebp` file with caption: `togif`\n' +
          '• Reply to a `.awebp` file or sticker with: `togif`'
        );
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

      if (!buffer || buffer.length === 0) {
        return await reply('❌ *Failed to download media file. Please try again.*');
      }

      // 3. Convert WebP / .awebp media buffer into GIF & MP4
      const { gifBuffer, mp4Buffer } = await convertWebpToGif(buffer);

      // 4. Send converted GIF / video back to chat
      if (mp4Buffer) {
        // Send as native GIF playback video in WhatsApp
        await sock.sendMessage(
          remoteJid,
          {
            video: mp4Buffer,
            gifPlayback: true,
            caption: '✅ *Converted to GIF!*'
          },
          { quoted: msg }
        );
      } else {
        // Fallback: send as GIF document
        await sock.sendMessage(
          remoteJid,
          {
            document: gifBuffer,
            mimetype: 'image/gif',
            fileName: 'converted.gif',
            caption: '✅ *Converted to GIF!*'
          },
          { quoted: msg }
        );
      }

      // Send success reaction
      await sock.sendMessage(remoteJid, { react: { text: "✅", key: msg.key } });

    } catch (err) {
      logger.error({ err }, 'Error in togif command execution');
      await reply(`❌ *Failed to convert file to GIF:* ${err.message || 'Unknown error'}`);
    }
  }
};
