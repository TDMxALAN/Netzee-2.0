import config from '../config/config.js';
import commandHandler from './commandHandler.js';
import logger from '../utils/logger.js';
import { findBannedWord, getFilterConfig, removeWordsByIndex } from '../utils/filterStore.js';
import { getBotAdminStatus, isSenderAdmin } from '../utils/groupUtils.js';
import { getBannedListSession, setBannedListSession, clearBannedListSession } from '../utils/sessionStore.js';
import { downloadMediaMessage } from '@whiskeysockets/baileys';

/**
 * Message Handler Module
 * Evaluates incoming messages against prefix requirements:
 * - Group Chats: Requires '!' or '.' at the beginning.
 * - DM Chats: Works with any prefix or without a prefix (prefix-less).
 *
 * Additionally handles:
 * - Word filter: Deletes group messages containing banned words (when filter is ON).
 * - Banned-list reply sessions: Lets admins reply with a number to remove a word.
 * - Anti-View Once: Any reply to a view-once → auto-forward media to self chat.
 */
export async function handleIncomingMessage(sock, messageInfo) {
  try {
    const { messages, type } = messageInfo;

    // Only process 'notify' (new incoming message) events
    if (type !== 'notify' || !messages || messages.length === 0) {
      return;
    }

    const msg = messages[0];

    // Ignore status updates, broadcast messages, or messages without content
    if (!msg.message || msg.key.remoteJid === 'status@broadcast') {
      return;
    }

    // Ignore messages sent by the bot itself
    if (msg.key.fromMe) {
      return;
    }

    const remoteJid = msg.key.remoteJid;
    const isGroup = remoteJid.endsWith('@g.us');

    // ════════════════════════════════════════════════════════════════
    // ANTI-VIEW ONCE
    // Any reply to a view-once message (with or without prefix)
    // → download media → forward silently to bot's self chat.
    // Ported from angiegangsta-x/plugins/media.js → vvHandler()
    //            and angiegangsta-x/lib/utils.js → downloadMessageMedia()
    // ════════════════════════════════════════════════════════════════
    await antiViewOnce(sock, msg);

    // Extract text content from various message types
    const body = (
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption ||
      ''
    ).trim();

    if (!body) {
      return;
    }

    // ════════════════════════════════════════════════════════════════
    // WORD FILTER — runs for every group message before command logic
    // ════════════════════════════════════════════════════════════════
    if (isGroup) {
      const senderJid = msg.key.participant || msg.participant || remoteJid;

      // ── Step 1: Check banned-list reply session ──────────────────
      const session = getBannedListSession(remoteJid);
      if (session) {
        const quotedId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
        const isReplyToBannedList = quotedId === session.bannedListMsgId;

        if (isReplyToBannedList) {
          const { isAdmin, metadata } = await getBotAdminStatus(sock, remoteJid);

          if (isAdmin && isSenderAdmin(metadata, senderJid)) {
            const indices = body
              .split(/[\s,]+/)
              .map(s => parseInt(s.trim(), 10))
              .filter(n => !isNaN(n) && n > 0);

            if (indices.length > 0) {
              const { words } = getFilterConfig(remoteJid);
              const validIndices = indices.filter(i => i <= words.length);
              const invalidIndices = indices.filter(i => i > words.length);

              if (validIndices.length === 0) {
                await sock.sendMessage(
                  remoteJid,
                  { text: `❌ Invalid number(s). The list only has *${words.length}* word(s).` },
                  { quoted: msg }
                );
              } else {
                const removed = removeWordsByIndex(remoteJid, validIndices);
                const formatted = removed.map(w => `\`${w}\``).join(', ');

                let responseText = `✅ *Removed ${removed.length} word(s):*\n${formatted}`;
                if (invalidIndices.length > 0) {
                  responseText += `\n\n⚠️ Ignored out-of-range number(s): ${invalidIndices.join(', ')}`;
                }

                const { words: updatedWords, enabled } = getFilterConfig(remoteJid);

                if (updatedWords.length === 0) {
                  responseText += '\n\n📋 The banned word list is now *empty*.';
                  await sock.sendMessage(remoteJid, { text: responseText }, { quoted: msg });
                  clearBannedListSession(remoteJid);
                } else {
                  const numberedList = updatedWords
                    .map((w, i) => `  ${i + 1}. \`${w}\``)
                    .join('\n');

                  responseText +=
                    `\n\n📋 *Updated Banned List* (${updatedWords.length} word${updatedWords.length === 1 ? '' : 's'})\n` +
                    `🔴 Filter: *${enabled ? 'ON' : 'OFF'}*\n\n` +
                    `${numberedList}\n\n` +
                    `💡 Reply with a number to remove another word.`;

                  const sentMsg = await sock.sendMessage(
                    remoteJid,
                    { text: responseText },
                    { quoted: msg }
                  );

                  const newMsgId = sentMsg?.key?.id;
                  if (newMsgId) {
                    setBannedListSession(remoteJid, newMsgId);
                  }
                }
              }

              return;
            }
          }
        }
      }

      // ── Step 2: Word filter check ────────────────────────────────
      const groupPrefixesLocal = config.groupPrefixes;
      const isCommand = groupPrefixesLocal.some(p => body.startsWith(p));

      if (!isCommand) {
        const matchedWord = findBannedWord(remoteJid, body);
        if (matchedWord) {
          try {
            await sock.sendMessage(remoteJid, { delete: msg.key });
            logger.info(
              { groupJid: remoteJid, word: matchedWord },
              'Deleted message containing banned word'
            );
          } catch (err) {
            logger.warn({ err }, 'Failed to delete message with banned word (bot may not be admin)');
          }
          return;
        }
      }
    }

    // ════════════════════════════════════════════════════════════════
    // COMMAND ROUTING
    // ════════════════════════════════════════════════════════════════

    let commandName = '';
    let args = [];
    let usedPrefix = '';
    let isCommandMatched = false;

    const groupPrefixes = config.groupPrefixes;

    if (isGroup) {
      const matchingPrefix = groupPrefixes.find(p => body.startsWith(p));
      if (!matchingPrefix) {
        return;
      }

      usedPrefix = matchingPrefix;
      const contentWithoutPrefix = body.slice(matchingPrefix.length).trim();
      const parts = contentWithoutPrefix.split(/\s+/);
      commandName = parts[0];
      args = parts.slice(1);
      isCommandMatched = true;
    } else {
      const matchingPrefix = groupPrefixes.find(p => body.startsWith(p));

      if (matchingPrefix) {
        usedPrefix = matchingPrefix;
        const contentWithoutPrefix = body.slice(matchingPrefix.length).trim();
        const parts = contentWithoutPrefix.split(/\s+/);
        commandName = parts[0];
        args = parts.slice(1);
        isCommandMatched = true;
      } else {
        const symbolPrefixMatch = body.match(/^^[^\w\s]/);
        if (symbolPrefixMatch) {
          usedPrefix = symbolPrefixMatch[0];
          const contentWithoutPrefix = body.slice(usedPrefix.length).trim();
          const parts = contentWithoutPrefix.split(/\s+/);
          commandName = parts[0];
          args = parts.slice(1);
          isCommandMatched = true;
        } else {
          const parts = body.split(/\s+/);
          const potentialCmd = parts[0];
          const targetCommand = commandHandler.getCommand(potentialCmd);
          if (targetCommand) {
            usedPrefix = '';
            commandName = potentialCmd;
            args = parts.slice(1);
            isCommandMatched = true;
          }
        }
      }
    }

    if (!isCommandMatched || !commandName) {
      return;
    }

    const command = commandHandler.getCommand(commandName);
    if (!command) {
      return;
    }

    logger.info({
      command: command.name,
      from: remoteJid,
      isGroup,
      usedPrefix
    }, `Executing command [${command.name}]`);

    const context = {
      sock,
      msg,
      remoteJid,
      isGroup,
      body,
      args,
      usedPrefix,
      reply: async (text) => {
        return await sock.sendMessage(remoteJid, { text }, { quoted: msg });
      }
    };

    await command.execute(context);

  } catch (err) {
    logger.error({ err }, 'Error processing incoming message');
  }
}

export default handleIncomingMessage;

// ════════════════════════════════════════════════════════════════════════════
// ANTI-VIEW ONCE — ported from angiegangsta-x
//
// Reference files:
//   lib/utils.js  → unwrapMessage(), extractMediaType(), downloadMessageMedia()
//   plugins/media.js → vvHandler()
//
// When the bot sees ANY reply to a view-once message it downloads the media
// and silently forwards it to the bot's own self-chat JID.
// No command prefix required — any reply text triggers it.
// ════════════════════════════════════════════════════════════════════════════

/** angiegangsta-x utils.js → unwrapMessage() — exact port */
function unwrapMessage(message) {
  if (!message) return null;
  const inner =
    message.viewOnceMessage?.message ||
    message.viewOnceMessageV2?.message ||
    message.viewOnceMessageV2Extension?.message ||
    message.ephemeralMessage?.message ||
    message.documentWithCaptionMessage?.message ||
    message.editedMessage?.message ||
    null;
  return inner || message;
}

/** angiegangsta-x utils.js → extractMediaType() — exact port */
function extractMediaType(message) {
  const m = unwrapMessage(message);
  if (!m) return null;
  if (m.imageMessage)    return { type: 'image',    node: m.imageMessage,    holder: m };
  if (m.videoMessage)    return { type: 'video',    node: m.videoMessage,    holder: m };
  if (m.audioMessage)    return { type: 'audio',    node: m.audioMessage,    holder: m };
  if (m.stickerMessage)  return { type: 'sticker',  node: m.stickerMessage,  holder: m };
  if (m.documentMessage) return { type: 'document', node: m.documentMessage, holder: m };
  if (m.documentWithCaptionMessage?.message?.documentMessage) {
    return { type: 'document', node: m.documentWithCaptionMessage.message.documentMessage, holder: m };
  }
  return null;
}

/**
 * angiegangsta-x utils.js → downloadMessageMedia() — exact port (ESM, preferQuoted=true)
 * Downloads the quoted message's media. Returns { buffer, type, caption, isViewOnce, mimetype }
 */
async function downloadMessageMediaFromQuoted(sock, m) {
  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);
  const P = require('pino');
  const silent = P({ level: 'silent' });

  const msg = m.message || {};
  const ctx = msg.extendedTextMessage?.contextInfo
    || msg.imageMessage?.contextInfo
    || msg.videoMessage?.contextInfo
    || msg.audioMessage?.contextInfo
    || msg.stickerMessage?.contextInfo
    || msg.documentMessage?.contextInfo
    || null;

  if (!ctx?.quotedMessage) return null;

  const info = extractMediaType(ctx.quotedMessage);
  if (!info) return null;

  const isViewOnce = !!(
    ctx.quotedMessage.viewOnceMessage ||
    ctx.quotedMessage.viewOnceMessageV2 ||
    ctx.quotedMessage.viewOnceMessageV2Extension
  );

  // Build target object — key points to quoted msg, message is the unwrapped holder
  const target = {
    key: {
      remoteJid: m.key.remoteJid,
      id: ctx.stanzaId,
      participant: ctx.participant,
      fromMe: false,
    },
    message: info.holder,
  };

  const buffer = await downloadMediaMessage(
    target,
    'buffer',
    {},
    { logger: silent, reuploadRequest: sock.updateMediaMessage }
  );

  return {
    buffer: Buffer.from(buffer),
    type: info.type,
    caption: info.node?.caption || '',
    isViewOnce,
    mimetype: info.node?.mimetype || '',
  };
}

/** Exact port of angiegangsta-x plugins/media.js → vvHandler() logic, auto-triggered on reply */
async function antiViewOnce(sock, msg) {
  try {
    const rawMsg = msg.message || {};

    // Check if this message is a reply at all
    const ctx =
      rawMsg.extendedTextMessage?.contextInfo ||
      rawMsg.imageMessage?.contextInfo       ||
      rawMsg.videoMessage?.contextInfo       ||
      rawMsg.audioMessage?.contextInfo       ||
      rawMsg.stickerMessage?.contextInfo     ||
      rawMsg.documentMessage?.contextInfo    ||
      null;

    if (!ctx?.quotedMessage) return; // not a reply

    // Check if the quoted (replied-to) message is a view-once
    const quotedMsg = ctx.quotedMessage;
    const isViewOnce = !!(
      quotedMsg.viewOnceMessage           ||
      quotedMsg.viewOnceMessageV2         ||
      quotedMsg.viewOnceMessageV2Extension
    );
    if (!isViewOnce) return; // quoted msg is not a view-once

    logger.info(
      { from: msg.key.remoteJid },
      '[AntiViewOnce] view-once reply detected — downloading and forwarding to self'
    );

    // Download exactly as vvHandler does via downloadMessageMedia(ctx.sock, ctx.m, { preferQuoted: true })
    const media = await downloadMessageMediaFromQuoted(sock, msg);
    if (!media) {
      logger.warn('[AntiViewOnce] could not download media — may have expired');
      return;
    }

    // Resolve self-chat JID (strip :device suffix e.g. 628xxx:12@s.whatsapp.net → 628xxx@s.whatsapp.net)
    const selfJid = sock.user?.id;
    if (!selfJid) return;
    const selfBareJid = selfJid.includes(':')
      ? selfJid.split(':')[0] + '@s.whatsapp.net'
      : selfJid;

    // Build caption (same info reference repo shows)
    const senderName = msg.pushName || (msg.key.participant || msg.key.remoteJid).split('@')[0];
    const chatLabel  = msg.key.remoteJid.endsWith('@g.us') ? msg.key.remoteJid : 'DM';
    const caption    = `🔓 *view once unlocked*\n👤 from: ${senderName}\n💬 chat: ${chatLabel}`;

    // Send to self — mirrors exact payload from vvHandler in angiegangsta-x
    if (media.type === 'video') {
      await sock.sendMessage(selfBareJid, { video: media.buffer, caption });
    } else if (media.type === 'audio') {
      await sock.sendMessage(selfBareJid, {
        audio: media.buffer,
        mimetype: 'audio/mpeg',
        ptt: true,
      });
    } else {
      // image (default)
      await sock.sendMessage(selfBareJid, {
        image: media.buffer,
        caption: `🔓 *view once unlocked*\n> ${senderName}`,
      });
    }

    logger.info('[AntiViewOnce] forwarded to self chat ✓');

  } catch (err) {
    logger.error({ err }, '[AntiViewOnce] error');
  }
}
