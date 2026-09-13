import { downloadFacebookVideo } from '../../utils/facebookDownloader.js';
import logger from '../../utils/logger.js';

/**
 * Facebook Video Downloader Command
 * Usage:
 * - Groups: !fb <link> or .fb <link>
 * - DM: fb <link> (supports prefix or prefix-less)
 * Example: fb https://www.facebook.com/share/r/18BME5nC9E/?mibextid=wwXIfr
 */
export default {
  name: 'fb',
  description: 'Download Facebook videos in maximum available quality',
  aliases: ['facebook', 'fbdl'],
  category: 'utility',

  /**
   * Executes the Facebook downloader command.
   * @param {object} ctx - Execution context containing sock, msg, reply, args, remoteJid
   */
  async execute(ctx) {
    const { args, reply, sock, remoteJid, msg } = ctx;

    // Check if URL parameter was provided
    if (!args || args.length === 0) {
      return await reply(
        '⚠️ *Please provide a valid Facebook video link!*\n\n' +
        '📌 *Example usage:*\n' +
        '`fb https://www.facebook.com/share/r/18BME5nC9E/?mibextid=wwXIfr`'
      );
    }

    const inputUrl = args[0];

    try {
      // Send processing message
      await reply('⏳ *Fetching Facebook video in highest quality... Please wait.*');

      // Extract high quality video download URL
      const result = await downloadFacebookVideo(inputUrl);

      if (!result || !result.downloadUrl) {
        return await reply('❌ *Failed to fetch video. Please make sure the video is public.*');
      }

      // Send the downloaded video message with caption
      const captionText = `📹 *Facebook Video Downloaded*\n` +
        `✨ *Quality:* ${result.quality}\n` +
        `🤖 *Downloaded via Netzee Bot*`;

      await sock.sendMessage(
        remoteJid,
        {
          video: { url: result.downloadUrl },
          caption: captionText,
          mimetype: 'video/mp4'
        },
        { quoted: msg }
      );

      logger.info({ url: inputUrl, quality: result.quality }, 'Successfully sent Facebook video');

    } catch (err) {
      logger.error({ err, url: inputUrl }, 'Facebook download error');
      await reply(`❌ *Error:* ${err.message || 'Unable to download Facebook video.'}`);
    }
  }
};
