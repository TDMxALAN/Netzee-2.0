import { downloadTikTokVideo } from '../../utils/tiktokDownloader.js';
import logger from '../../utils/logger.js';

/**
 * TikTok Video Downloader Command
 * Usage:
 * - Groups: !tt <link> or .tt <link>
 * - DM: tt <link> (supports prefix or prefix-less)
 * Example: tt https://vt.tiktok.com/ZSqHyt1WK/
 */
export default {
  name: 'tt',
  description: 'Download TikTok videos in maximum available quality without watermark',
  aliases: ['tiktok', 'ttdl'],
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
        '`tt https://vt.tiktok.com/ZSqHyt1WK/`'
      );
    }

    const inputUrl = args[0];

    try {
      // Send processing reaction indicator
      await sock.sendMessage(remoteJid, { react: { text: "⏳", key: msg.key } });

      // Extract maximum quality video download details
      const result = await downloadTikTokVideo(inputUrl);

      if (!result || !result.downloadUrl) {
        return await reply('❌ *Failed to fetch video. Please make sure the video is public.*');
      }

      // Format caption with video details
      let captionText = `🎵 *TikTok Video Downloaded*\n`;
      if (result.author) {
        captionText += `👤 *Creator:* ${result.author}\n`;
      }
      if (result.title) {
        // Truncate long captions to keep message clean
        const titleSnippet = result.title.length > 100 
          ? result.title.substring(0, 100) + '...' 
          : result.title;
        captionText += `📝 *Caption:* ${titleSnippet}\n`;
      }
      captionText += `✨ *Quality:* ${result.quality}\n`;
      captionText += `🤖 *Downloaded via Netzee Bot*`;

      // Send the downloaded video message
      await sock.sendMessage(
        remoteJid,
        {
          video: { url: result.downloadUrl },
          caption: captionText,
          mimetype: 'video/mp4'
        },
        { quoted: msg }
      );

      // React with success checkmark
      await sock.sendMessage(remoteJid, { react: { text: "✅", key: msg.key } });

      logger.info({ url: inputUrl, quality: result.quality }, 'Successfully sent TikTok video');

    } catch (err) {
      logger.error({ err, url: inputUrl }, 'TikTok download error');
      
      // React with failure X mark
      try {
        await sock.sendMessage(remoteJid, { react: { text: "❌", key: msg.key } });
      } catch (reactErr) {
        // Ignore reaction error if message fails
      }

      await reply(`❌ *Error:* ${err.message || 'Unable to download TikTok video.'}`);
    }
  }
};
