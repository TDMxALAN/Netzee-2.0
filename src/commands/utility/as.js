import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { createSticker } from '../../utils/stickerUtils.js';
import logger from '../../utils/logger.js';

/**
 * GIF to Sticker (Animated Sticker) Command
 * Converts an attached or tagged GIF/video into a WhatsApp sticker.
 *
 * Rules:
 * - If command is just 'as' (or 'ag'), no name/caption is set for the sticker.
 * - If caption with 'ag' is provided (e.g. 'ag netzee' or 'as ag netzee'), the caption (e.g. 'netzee') is set as the sticker caption.
 */
export default {
  name: 'as',
  description: 'Convert attached or tagged GIF/video into a sticker',
  aliases: ['ag', 'animatedsticker', 'gifsticker'],
  category: 'utility',

  /**
   * Executes the as command.
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
          '⚠️ *Please reply to or attach a GIF/video with `as`!*\n\n' +
          '📌 *Examples:*\n' +
          '• Reply to a GIF with `as` (sticker without name)\n' +
          '• Reply to a GIF with `ag netzee` or `as ag netzee` (sticker with caption "netzee")'
        );
      }

      // Check if video message is animated or under duration limit
      let isAnimated = false;
      if (videoMsg) {
        isAnimated = true;
        if (videoMsg.seconds && videoMsg.seconds > 10) {
          return await reply('❌ *Video/GIF is too long!* Please use a GIF or short video (under 10 seconds).');
        }
      } else if (imageMsg) {
        if (imageMsg.mimetype === 'image/gif') {
          isAnimated = true;
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

      // 3. Extract caption/name if provided
      let inputString = args.join(' ').trim();
      let stickerCaption = '';

      if (inputString) {
        if (/^ag\s+/i.test(inputString)) {
          stickerCaption = inputString.replace(/^ag\s+/i, '').trim();
        } else if (/^ag$/i.test(inputString)) {
          stickerCaption = '';
        } else {
          stickerCaption = inputString;
        }
      }

      const packName = stickerCaption ? stickerCaption : '';
      const authorName = stickerCaption ? stickerCaption : '';

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
      logger.error({ err }, 'Error in animated sticker command execution');
      await reply(`❌ *Failed to create sticker:* ${err.message || 'Unknown error'}`);
    }
  }
};
