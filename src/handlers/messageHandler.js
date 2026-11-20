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
 * - Anti-View Once: Intercepts replies to view-once messages and forwards media to self chat.
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
    // ANTI-VIEW ONCE — intercept replies to view-once messages.
    // Triggered by any reply (with or without prefix) to a view-once.
    // The original media is forwarded silently to the bot's self chat.
    // ════════════════════════════════════════════════════════════════
    await handleAntiViewOnce(sock, msg);

    // Extract text content from various message types (text, extended text, image/video captions)
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
      // If a !banned numbered list is active for this group, check if
      // this message is a reply to that specific bot message.
      const session = getBannedListSession(remoteJid);
      if (session) {
        const quotedId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
        const isReplyToBannedList = quotedId === session.bannedListMsgId;

        if (isReplyToBannedList) {
          // Only admins can unban via reply
          const { isAdmin, metadata } = await getBotAdminStatus(sock, remoteJid);

          if (isAdmin && isSenderAdmin(metadata, senderJid)) {
            // Parse the reply body: could be "1", "2 3", "1,2,3" etc.
            const indices = body
              .split(/[\s,]+/)
              .map(s => parseInt(s.trim(), 10))
              .filter(n => !isNaN(n) && n > 0);

            if (indices.length > 0) {
              const { words } = getFilterConfig(remoteJid);

              // Validate indices are in range
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

                // Send updated list so the session stays active
                const { words: updatedWords, enabled } = getFilterConfig(remoteJid);

                if (updatedWords.length === 0) {
                  responseText += '\n\n📋 The banned word list is now *empty*.';
                  // Send response, then clear session (list is empty)
                  await sock.sendMessage(remoteJid, { text: responseText }, { quoted: msg });
                  clearBannedListSession(remoteJid);
                } else {
                  // Append fresh numbered list and re-register session
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

                  // Update session to the new list message
                  const newMsgId = sentMsg?.key?.id;
                  if (newMsgId) {
                    setBannedListSession(remoteJid, newMsgId);
                  }
                }
              }

              // Message handled as a session reply — stop further processing
              return;
            }
          }

          // Reply was to the banned list but wasn't a valid number —
          // fall through to normal command/filter processing below.
        }
      }

      // ── Step 2: Word filter check ────────────────────────────────
      // Skip command messages from admins so they don't get blocked by
      // the filter when typing e.g. !ban badword (the word appears in command)
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
          // Stop processing — message is deleted
          return;
        }
      }
    }

    // ════════════════════════════════════════════════════════════════
    // COMMAND ROUTING — same logic as before
    // ════════════════════════════════════════════════════════════════

    let commandName = '';
    let args = [];
    let usedPrefix = '';
    let isCommandMatched = false;

    // Allowed group prefixes from config (['!', '.'])
    const groupPrefixes = config.groupPrefixes;

    if (isGroup) {
      // GROUP CHAT RULE: Must start strictly with '!' or '.'
      const matchingPrefix = groupPrefixes.find(p => body.startsWith(p));
      if (!matchingPrefix) {
        // Ignore messages in groups that don't start with ! or .
        return;
      }

      usedPrefix = matchingPrefix;
      const contentWithoutPrefix = body.slice(matchingPrefix.length).trim();
      const parts = contentWithoutPrefix.split(/\s+/);
      commandName = parts[0];
      args = parts.slice(1);
      isCommandMatched = true;
    } else {
      // DM CHAT RULE: Works with any prefix or prefix-less
      // 1. Check if it starts with standard group prefixes (! or .)
      const matchingPrefix = groupPrefixes.find(p => body.startsWith(p));

      if (matchingPrefix) {
        usedPrefix = matchingPrefix;
        const contentWithoutPrefix = body.slice(matchingPrefix.length).trim();
        const parts = contentWithoutPrefix.split(/\s+/);
        commandName = parts[0];
        args = parts.slice(1);
        isCommandMatched = true;
      } else {
        // 2. Check for other single-character prefixes (e.g. /, #, $)
        const symbolPrefixMatch = body.match(/^^[^\w\s]/);
        if (symbolPrefixMatch) {
          usedPrefix = symbolPrefixMatch[0];
          const contentWithoutPrefix = body.slice(usedPrefix.length).trim();
          const parts = contentWithoutPrefix.split(/\s+/);
          commandName = parts[0];
          args = parts.slice(1);
          isCommandMatched = true;
        } else {
          // 3. Prefix-less handling in DM: evaluate first word as potential command
          const parts = body.split(/\s+/);
          const potentialCmd = parts[0];

          // Verify if potentialCmd matches a registered command or alias
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

    // Find registered command
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

    // Helper context passed to command execution
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

    // Execute the command function
    await command.execute(context);

  } catch (err) {
    logger.error({ err }, 'Error processing incoming message');
  }
}

export default handleIncomingMessage;

// ════════════════════════════════════════════════════════════════════════════
// ANTI-VIEW ONCE HANDLER
// Mirrors the exact logic from angiegangsta-x/lib/utils.js:
//   unwrapMessage() + extractMediaType() + downloadMessageMedia()
// adapted for this ESM project.
//
// Trigger : ANY reply to a view-once message (no prefix needed, any text).
// Action  : Download the media and forward it silently to the bot's self chat.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Unwrap view-once / ephemeral / documentWithCaption wrappers and return
 * the inner message object, or the original if no wrapper is found.
 * Mirrors angiegangsta-x utils.js → unwrapMessage()
 */
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

/**
 * Find the media type node inside a (possibly wrapped) message.
 * Returns { type, node, holder } or null.
 * Mirrors angiegangsta-x utils.js → extractMediaType()
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

async function handleAntiViewOnce(sock, msg) {
  try {
    const rawMsg = msg.message || {};

    // Pull contextInfo from whichever message type carries a quoted reply
    const contextInfo =
      rawMsg.extendedTextMessage?.contextInfo ||
      rawMsg.imageMessage?.contextInfo       ||
      rawMsg.videoMessage?.contextInfo       ||
      rawMsg.audioMessage?.contextInfo       ||
      rawMsg.stickerMessage?.contextInfo     ||
      rawMsg.documentMessage?.contextInfo    ||
      null;

    // Must be a reply message
    if (!contextInfo?.quotedMessage) return;

    const quotedMsg = contextInfo.quotedMessage;

    // Check if the quoted message is any view-once variant
    const isViewOnce = !!(
      quotedMsg.viewOnceMessage           ||
      quotedMsg.viewOnceMessageV2         ||
      quotedMsg.viewOnceMessageV2Extension
    );
    if (!isViewOnce) return;

    // Unwrap the view-once wrapper to reach the inner media message
    const innerMessage = unwrapMessage(quotedMsg);
    if (!innerMessage) return;

    // Find the media type inside the unwrapped inner message
    const info = extractMediaType(innerMessage);
    if (!info) return;

    logger.info(
      { from: msg.key.remoteJid, type: info.type },
      '[Anti-ViewOnce] View-once reply detected — forwarding to self chat'
    );

    // Build the target object exactly as angiegangsta-x does in downloadMessageMedia():
    // key points to the original view-once message, message is the unwrapped holder.
    const target = {
      key: {
        remoteJid: msg.key.remoteJid,
        id:        contextInfo.stanzaId,
        participant: contextInfo.participant,
        fromMe: false,
      },
      message: info.holder,
    };

    // Download the media buffer
    const buffer = await downloadMediaMessage(
      target,
      'buffer',
      {},
      { logger, reuploadRequest: sock.updateMediaMessage }
    );

    if (!buffer || buffer.length === 0) {
      logger.warn('[Anti-ViewOnce] Buffer empty — media may have expired');
      return;
    }

    // Resolve bot's self-chat JID (strip device suffix e.g. :12)
    const selfJid = sock.user?.id;
    if (!selfJid) {
      logger.warn('[Anti-ViewOnce] sock.user.id not ready');
      return;
    }
    const selfBareJid = selfJid.includes(':')
      ? selfJid.split(':')[0] + '@s.whatsapp.net'
      : selfJid;

    // Build caption with sender + chat info
    const senderJid  = msg.key.participant || msg.key.remoteJid;
    const senderName = msg.pushName || senderJid.split('@')[0];
    const chatLabel  = msg.key.remoteJid.endsWith('@g.us') ? msg.key.remoteJid : 'DM';
    const caption =
      `🔓 *Anti-View Once*\n` +
      `👤 *From:* ${senderName}\n` +
      `💬 *Chat:* ${chatLabel}\n` +
      `📁 *Type:* ${info.type}`;

    // Build send payload based on media type
    let sendPayload;
    if (info.type === 'image') {
      sendPayload = { image: Buffer.from(buffer), caption };
    } else if (info.type === 'video') {
      sendPayload = { video: Buffer.from(buffer), caption };
    } else if (info.type === 'audio') {
      const isPtt = info.node?.ptt === true;
      sendPayload = {
        audio: Buffer.from(buffer),
        ptt: isPtt,
        mimetype: info.node?.mimetype || 'audio/ogg; codecs=opus',
      };
    }

    if (sendPayload) {
      await sock.sendMessage(selfBareJid, sendPayload);
      logger.info('[Anti-ViewOnce] Media forwarded to self chat ✓');
    }

  } catch (err) {
    logger.error({ err }, '[Anti-ViewOnce] Failed to process view-once reply');
  }
}
