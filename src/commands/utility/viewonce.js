import {
  isViewOnceMessage,
  extractMediaType,
  downloadMediaBuffer,
  resolveSelfBareJid
} from '../../utils/viewOnceUtils.js';
import logger from '../../utils/logger.js';

/**
 * View Once Command
 * Unlocks and retrieves view-once images, videos, and voice notes.
 *
 * Usage:
 * - Reply to any view-once message with `!vv` (or `.vv`, `!viewonce`, `.rvo`)
 */
export default {
  name: 'viewonce',
  description: 'Unlock and retrieve view-once photos, videos, and audio',
  aliases: ['vv', 'vo', 'rvo', 'antiviewonce', 'readviewonce'],
  category: 'utility',

  /**
   * Executes the viewonce command.
   * @param {object} ctx - Execution context containing sock, msg, remoteJid, reply, usedPrefix
   */
  async execute(ctx) {
    const { sock, msg, remoteJid, reply, usedPrefix } = ctx;

    try {
      // 1. Locate contextInfo (quoted message)
      const rawMsg = msg.message || {};
      const contextInfo =
        rawMsg.extendedTextMessage?.contextInfo ||
        rawMsg.imageMessage?.contextInfo ||
        rawMsg.videoMessage?.contextInfo ||
        rawMsg.audioMessage?.contextInfo ||
        rawMsg.stickerMessage?.contextInfo ||
        rawMsg.documentMessage?.contextInfo ||
        null;

      const quotedMsg = contextInfo?.quotedMessage;

      // 2. Validate that user replied to a view-once message
      if (!quotedMsg) {
        return await reply(
          `⚠️ *Please reply to a view-once message!*\n\n` +
          `*Usage:* Reply to a view-once photo, video, or voice note with \`${usedPrefix || '!'}vv\``
        );
      }

      if (!isViewOnceMessage(quotedMsg)) {
        return await reply(
          `❌ *The replied message is not a view-once message!*\n\n` +
          `Make sure you are replying directly to a view-once photo, video, or audio note.`
        );
      }

      // 3. Extract media info
      const info = extractMediaType(quotedMsg);
      if (!info) {
        return await reply(`❌ *Unsupported view-once media type.*`);
      }

      // Send processing reaction
      await sock.sendMessage(remoteJid, { react: { text: "⏳", key: msg.key } });

      // 4. Download media buffer
      const fallbackTarget = {
        key: {
          remoteJid: msg.key.remoteJid,
          id: contextInfo.stanzaId,
          participant: contextInfo.participant,
          fromMe: false,
        },
        message: info.holder,
      };

      const buffer = await downloadMediaBuffer(info, fallbackTarget, sock);

      if (!buffer || buffer.length === 0) {
        await sock.sendMessage(remoteJid, { react: { text: "❌", key: msg.key } });
        return await reply(
          `❌ *Failed to download view-once media.*\n` +
          `The media may have already expired or been purged from WhatsApp servers.`
        );
      }

      // 5. Send unlocked media back to the current chat
      const senderJid = contextInfo.participant || remoteJid;
      const senderName = senderJid.split('@')[0];
      const caption = `🔓 *View Once Unlocked*\n👤 *From:* @${senderName}`;

      if (info.type === 'image') {
        await sock.sendMessage(
          remoteJid,
          {
            image: buffer,
            caption,
            mentions: [senderJid]
          },
          { quoted: msg }
        );
      } else if (info.type === 'video') {
        await sock.sendMessage(
          remoteJid,
          {
            video: buffer,
            caption,
            mentions: [senderJid]
          },
          { quoted: msg }
        );
      } else if (info.type === 'audio') {
        await sock.sendMessage(
          remoteJid,
          {
            audio: buffer,
            mimetype: info.node?.mimetype || 'audio/ogg; codecs=opus',
            ptt: info.node?.ptt === true
          },
          { quoted: msg }
        );
      }

      // Send success reaction
      await sock.sendMessage(remoteJid, { react: { text: "✅", key: msg.key } });

      // 6. Also forward a backup copy to self-chat if not already in self-chat
      const selfBareJid = resolveSelfBareJid(sock);
      if (selfBareJid && selfBareJid !== remoteJid) {
        try {
          const chatLabel = remoteJid.endsWith('@g.us') ? remoteJid : 'DM';
          const selfCaption = `🔓 *view once unlocked*\n👤 from: ${senderName}\n💬 chat: ${chatLabel}`;

          if (info.type === 'image') {
            await sock.sendMessage(selfBareJid, { image: buffer, caption: selfCaption });
          } else if (info.type === 'video') {
            await sock.sendMessage(selfBareJid, { video: buffer, caption: selfCaption });
          } else if (info.type === 'audio') {
            await sock.sendMessage(selfBareJid, {
              audio: buffer,
              mimetype: info.node?.mimetype || 'audio/ogg; codecs=opus',
              ptt: info.node?.ptt === true
            });
          }
        } catch (e) {
          logger.warn({ err: e.message }, '[ViewOnce] Failed to forward backup to self chat');
        }
      }

    } catch (err) {
      logger.error({ err }, '[ViewOnce Command] Error executing viewonce command');
      await sock.sendMessage(remoteJid, { react: { text: "❌", key: msg.key } });
      await reply(`❌ *An error occurred while unlocking view-once media.*`);
    }
  }
};
