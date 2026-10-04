import { downloadTikTokVideo } from '../../utils/tiktokDownloader.js';
import logger from '../../utils/logger.js';

/**
 * TikTok Video Downloader Command
 * Usage:
 * - Groups: !tt <link> or .tt <link>
 * - DM: tt <link> (supports prefix or prefix-less)
 * Example: tt https://www.tiktok.com/@tiktok/video/7106594312292453675
 */
export default {
  name: 'tt',
  description: 'Download TikTok videos without watermark in maximum quality (multi-server fallback)',
  aliases: ['tiktok', 'ttdl', 'tik'],
  category: 'utility',

  /**
   * Executes the TikTok downloader command.
   * @param {object} ctx - Execution context containing sock, msg, reply, args, remoteJid
   */
  async execute(ctx) {
    const { args, reply, sock, remoteJid, msg } = ctx;

    // Check if URL parameter was provided
    if (!args || args.length === 0) {
      return await reply(
        '⚠️ *Please provide a valid TikTok video link!*\n\n' +
        '📌 *Example usage:*\n' +
        '`tt https://www.tiktok.com/@tiktok/video/7106594312292453675`'
      );
    }

    const inputUrl = args[0].trim();

    try {
      // Send processing reaction
      await sock.sendMessage(remoteJid, { react: { text: "⏳", key: msg.key } });

      // Extract video download URL using multi-backend fallback system
      const result = await downloadTikTokVideo(inputUrl);

      if (!result || !result.downloadUrl) {
        await sock.sendMessage(remoteJid, { react: { text: "❌", key: msg.key } });
        return await reply('❌ *Failed to fetch video. Please make sure the video link is public.*');
      }

      // Format caption text
      let captionText = `📹 *TikTok Video Downloaded*\n`;
      if (result.title) captionText += `📝 *Title:* ${result.title}\n`;
      if (result.author) captionText += `👤 *Creator:* ${result.author}\n`;
      captionText += `✨ *Quality:* ${result.quality}\n`;
      captionText += `⚡ *Source:* ${result.source}\n`;
      captionText += `🤖 *Downloaded via Netzee Bot*`;

      // Send the downloaded video message with caption
      await sock.sendMessage(
        remoteJid,
        {
          video: { url: result.downloadUrl },
          caption: captionText,
          mimetype: 'video/mp4'
        },
        { quoted: msg }
      );

      // React with success icon
      await sock.sendMessage(remoteJid, { react: { text: "✅", key: msg.key } });

      logger.info({ url: inputUrl, source: result.source, quality: result.quality }, 'Successfully sent TikTok video');

    } catch (err) {
      logger.error({ err, url: inputUrl }, 'TikTok download command error');
      try {
        await sock.sendMessage(remoteJid, { react: { text: "❌", key: msg.key } });
      } catch (reactErr) {
        // Ignore reaction failure
      }
      await reply(`❌ *Error:* ${err.message || 'Unable to download TikTok video.'}`);
    }
  }
};
