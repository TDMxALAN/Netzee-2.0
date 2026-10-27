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
      // Send processing reaction
      await sock.sendMessage(remoteJid, { react: { text: "⏳", key: msg.key } });

      // Extract high quality video download URL
      const result = await downloadFacebookVideo(inputUrl);

      if (!result || !result.buffer || result.buffer.length === 0) {
        await sock.sendMessage(remoteJid, { react: { text: "❌", key: msg.key } });
        return await reply('❌ *Failed to fetch video. Please make sure the video is public.*');
      }

      // Send the downloaded video message with caption
      let captionText = `📹 *Facebook Video Downloaded*\n`;
      if (result.title) captionText += `📝 *Title:* ${result.title}\n`;
      captionText += `✨ *Quality:* ${result.quality || 'HD'}\n` +
        `🤖 *Downloaded via Netzee Bot*`;

      // Send as document if > 60MB, otherwise native video message
      if (result.buffer.length > 60 * 1024 * 1024) {
        await sock.sendMessage(
          remoteJid,
          {
            document: result.buffer,
            mimetype: 'video/mp4',
            fileName: `${result.title ? result.title.slice(0, 50).replace(/[^\w\s-]/g, '') : 'facebook_video'}.mp4`,
            caption: captionText
          },
          { quoted: msg }
        );
      } else {
        await sock.sendMessage(
          remoteJid,
          {
            video: result.buffer,
            caption: captionText,
            mimetype: 'video/mp4'
          },
          { quoted: msg }
        );
      }

      // Send success reaction after video is sent
      await sock.sendMessage(remoteJid, { react: { text: "✅", key: msg.key } });

      logger.info({ url: inputUrl, quality: result.quality }, 'Successfully sent Facebook video');

    } catch (err) {
      logger.error({ err, url: inputUrl }, 'Facebook download error');
      try {
        await sock.sendMessage(remoteJid, { react: { text: "❌", key: msg.key } });
      } catch (reactErr) {
        // Ignore reaction failure
      }
      await reply(`❌ *Error:* ${err.message || 'Unable to download Facebook video.'}`);
    }
  }
};
