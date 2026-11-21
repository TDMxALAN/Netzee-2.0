import config from '../config/config.js';
import commandHandler from './commandHandler.js';
import logger from '../utils/logger.js';
import { findBannedWord, getFilterConfig, removeWordsByIndex } from '../utils/filterStore.js';
import { getBotAdminStatus, isSenderAdmin } from '../utils/groupUtils.js';
import { getBannedListSession, setBannedListSession, clearBannedListSession } from '../utils/sessionStore.js';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { isBotSentMessage } from '../utils/messageTracker.js';

/**
 * Message Handler Module
 * Evaluates incoming messages against prefix requirements:
 * - Group Chats: Requires '!' or '.' at the beginning.
 * - DM Chats: Works with any prefix or without a prefix (prefix-less).
 *
 * Additionally handles:
 * - Word filter: Deletes group messages containing banned words (when filter is ON).
 * - Banned-list reply sessions: Lets admins reply with a number to remove a word.
 * - Anti-View Once: view-once arrives OR reply to view-once → forward media to self chat.
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

    // Ignore automated messages generated and sent programmatically by the bot itself
    if (msg.key?.id && isBotSentMessage(msg.key.id)) {
      return;
    }

    // ════════════════════════════════════════════════════════════════
    // ANTI-VIEW ONCE
    // ════════════════════════════════════════════════════════════════
    await antiViewOnce(sock, msg);

    const remoteJid = msg.key.remoteJid;
    const isGroup = remoteJid.endsWith('@g.us');

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
      const senderJid = msg.key.fromMe
        ? (sock.user?.id || msg.key.participant || msg.participant || remoteJid)
        : (msg.key.participant || msg.participant || remoteJid);

      // ── Step 1: Check banned-list reply session ──────────────────
      const session = getBannedListSession(remoteJid);
      if (session) {
        const quotedId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
        const isReplyToBannedList = quotedId === session.bannedListMsgId;

        if (isReplyToBannedList) {
          const { isAdmin, metadata } = await getBotAdminStatus(sock, remoteJid);

          if (isAdmin && (msg.key.fromMe || isSenderAdmin(metadata, senderJid))) {
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

      if (!isCommand && !msg.key.fromMe) {
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

    const senderJid = msg.key.fromMe
      ? (sock.user?.id || msg.key.participant || msg.participant || remoteJid)
      : (msg.key.participant || msg.participant || remoteJid);

    const context = {
      sock,
      msg,
      remoteJid,
      isGroup,
      body,
      args,
      usedPrefix,
      senderJid,
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
// ANTI-VIEW ONCE — full port from angiegangsta-x
//
// Sources:
//   lib/utils.js      → unwrapMessage(), extractMediaType(), downloadMessageMedia()
//   plugins/media.js  → vvHandler()
//   lib/handler.js    → handleMessage() fromMe logic (reference for placement)
//
// BUGS FIXED vs previous attempts:
//   1. antiViewOnce() is now called BEFORE the `fromMe` guard so the bot owner's
//      own replies (fromMe=true) are not silently dropped before we can inspect them.
//   2. Dual trigger: auto-capture when view-once ARRIVES, plus reply-triggered capture.
//   3. Removed fragile createRequire(pino) — replaced with inline no-op logger.
// ════════════════════════════════════════════════════════════════════════════

// Inline silent logger — avoids dynamic require(pino) which could fail in ESM
const _silent = {
  level: 'silent',
  info:  () => {},
  warn:  () => {},
  error: () => {},
  debug: () => {},
  trace: () => {},
  child: function () { return this; },
};

/**
 * Exact port of angiegangsta-x lib/utils.js → unwrapMessage()
 * Strips view-once / ephemeral / documentWithCaption wrapper and returns inner message.
 */
function unwrapMessage(message) {
  if (!message) return null;
  const inner =
    message.viewOnceMessage?.message              ||
    message.viewOnceMessageV2?.message            ||
    message.viewOnceMessageV2Extension?.message   ||
    message.ephemeralMessage?.message             ||
    message.documentWithCaptionMessage?.message   ||
    message.editedMessage?.message                ||
    null;
  return inner || message;
}

/**
 * Exact port of angiegangsta-x lib/utils.js → extractMediaType()
 * Returns { type, node, holder } or null.
 */
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
 * Download media and send to bot's self-chat JID.
 * @param {object} target  - Baileys message object: { key, message }
 * @param {object} sock    - Baileys socket
 * @param {object} origMsg - Original incoming msg (for caption info)
 */
async function downloadAndForwardToSelf(sock, target, origMsg) {
  const info = extractMediaType(target.message);
  if (!info) {
    logger.warn('[AntiViewOnce] extractMediaType returned null — unsupported media type');
    return;
  }

  logger.info({ type: info.type, remoteJid: origMsg.key.remoteJid }, '[AntiViewOnce] downloading media');

  const buffer = await downloadMediaMessage(
    target,
    'buffer',
    {},
    { logger: _silent, reuploadRequest: sock.updateMediaMessage }
  );

  if (!buffer || buffer.length === 0) {
    logger.warn('[AntiViewOnce] buffer empty — media may have expired on WhatsApp servers');
    return;
  }

  // Resolve self-chat JID (strip :device suffix e.g. 628xxx:12@s.whatsapp.net)
  const selfJid = sock.user?.id;
  if (!selfJid) {
    logger.warn('[AntiViewOnce] sock.user.id not ready yet');
    return;
  }
  const selfBareJid = selfJid.includes(':')
    ? selfJid.split(':')[0] + '@s.whatsapp.net'
    : selfJid;

  const senderName = origMsg.pushName
    || (origMsg.key.participant || origMsg.key.remoteJid).split('@')[0];
  const chatLabel = origMsg.key.remoteJid.endsWith('@g.us')
    ? origMsg.key.remoteJid
    : 'DM';

  // Send payload — mirrors exact angiegangsta-x vvHandler() payload
  if (info.type === 'video') {
    await sock.sendMessage(selfBareJid, {
      video: Buffer.from(buffer),
      caption: `🔓 *view once unlocked*\n👤 from: ${senderName}\n💬 chat: ${chatLabel}`,
    });
  } else if (info.type === 'audio') {
    await sock.sendMessage(selfBareJid, {
      audio:    Buffer.from(buffer),
      mimetype: info.node?.mimetype || 'audio/mpeg',
      ptt:      info.node?.ptt === true,
    });
  } else {
    // image (and sticker fallback)
    await sock.sendMessage(selfBareJid, {
      image:   Buffer.from(buffer),
      caption: `🔓 *view once unlocked*\n> ${senderName}`,
    });
  }

  logger.info('[AntiViewOnce] forwarded to self chat ✓');
}

/**
 * Main anti-view-once gate — called BEFORE fromMe guard.
 *
 * Trigger A (auto-capture): incoming msg IS a view-once  → save it
 * Trigger B (reply-based):  incoming msg REPLIES to view-once → save it
 *
 * Both triggers work for fromMe=true (owner's own replies) because this
 * function runs before the fromMe early-return in handleIncomingMessage.
 */
async function antiViewOnce(sock, msg) {
  try {
    const rawMsg = msg.message || {};

    // ── Trigger A: the message itself IS a view-once ─────────────────
    // Fires when someone sends a view-once to us (fromMe=false).
    // Mirrors reference: const unwrapped = msg.viewOnceMessage || msg.viewOnceMessageV2 ...
    const directWrapper =
      rawMsg.viewOnceMessage            ||
      rawMsg.viewOnceMessageV2          ||
      rawMsg.viewOnceMessageV2Extension ||
      null;

    if (directWrapper) {
      const innerMsg = directWrapper.message;
      if (innerMsg) {
        const target = {
          key:     msg.key,
          message: unwrapMessage(rawMsg), // the inner { imageMessage / videoMessage / audioMessage }
        };
        await downloadAndForwardToSelf(sock, target, msg);
      }
      return; // handled — don't fall through to reply check
    }

    // ── Trigger B: message is a REPLY to a view-once ─────────────────
    // Fires when anyone (including the owner, fromMe=true) replies to a view-once.
    // Mirrors: downloadMessageMedia(sock, m, { preferQuoted: true }) in utils.js
    const ctx =
      rawMsg.extendedTextMessage?.contextInfo ||
      rawMsg.imageMessage?.contextInfo        ||
      rawMsg.videoMessage?.contextInfo        ||
      rawMsg.audioMessage?.contextInfo        ||
      rawMsg.stickerMessage?.contextInfo      ||
      rawMsg.documentMessage?.contextInfo     ||
      null;

    if (!ctx?.quotedMessage) return; // not a reply at all

    const quotedMsg = ctx.quotedMessage;
    const isViewOnce = !!(
      quotedMsg.viewOnceMessage            ||
      quotedMsg.viewOnceMessageV2          ||
      quotedMsg.viewOnceMessageV2Extension
    );
    if (!isViewOnce) return; // replied-to message is not a view-once

    // Unwrap the view-once wrapper to get { imageMessage / videoMessage / audioMessage }
    const info = extractMediaType(quotedMsg);
    if (!info) return;

    // Build target — exact same structure as angiegangsta-x utils.js downloadMessageMedia()
    const target = {
      key: {
        remoteJid:   msg.key.remoteJid,
        id:          ctx.stanzaId,
        participant: ctx.participant,
        fromMe:      false,
      },
      message: info.holder,
    };

    await downloadAndForwardToSelf(sock, target, msg);

  } catch (err) {
    logger.error({ err }, '[AntiViewOnce] unhandled error');
  }
}
