import config from '../config/config.js';
import commandHandler from './commandHandler.js';
import logger from '../utils/logger.js';
import { findBannedWord, getFilterConfig, removeWordsByIndex } from '../utils/filterStore.js';
import { getBotAdminStatus, isSenderAdmin } from '../utils/groupUtils.js';
import { getBannedListSession, setBannedListSession, clearBannedListSession } from '../utils/sessionStore.js';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { isBotSentMessage } from '../utils/messageTracker.js';
import {
  isViewOnceMessage,
  extractMediaType,
  downloadMediaBuffer,
  resolveSelfBareJid
} from '../utils/viewOnceUtils.js';

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
// ANTI-VIEW ONCE BACKGROUND HANDLER
// Auto-captures incoming view-once messages to self-chat and saves
// passive replies to view-once media.
// Note: Explicit commands (e.g. !vv, .vv, !viewonce) are handled by the viewonce command.
// ════════════════════════════════════════════════════════════════════════════
async function antiViewOnce(sock, msg) {
  try {
    const rawMsg = msg.message || {};

    // ── Trigger A: Incoming message ITSELF is a view-once ─────────────
    if (isViewOnceMessage(rawMsg)) {
      const info = extractMediaType(rawMsg);
      if (!info) return;

      const buffer = await downloadMediaBuffer(info, msg, sock);
      if (!buffer) return;

      const selfBareJid = resolveSelfBareJid(sock);
      if (!selfBareJid) return;

      const senderName = msg.pushName || (msg.key.participant || msg.key.remoteJid).split('@')[0];
      const chatLabel = msg.key.remoteJid.endsWith('@g.us') ? msg.key.remoteJid : 'DM';
      const caption = `🔓 *view once unlocked*\n👤 from: ${senderName}\n💬 chat: ${chatLabel}`;

      if (info.type === 'video') {
        await sock.sendMessage(selfBareJid, { video: buffer, caption });
      } else if (info.type === 'audio') {
        await sock.sendMessage(selfBareJid, {
          audio: buffer,
          mimetype: info.node?.mimetype || 'audio/ogg; codecs=opus',
          ptt: info.node?.ptt === true
        });
      } else {
        await sock.sendMessage(selfBareJid, { image: buffer, caption });
      }
      logger.info('[AntiViewOnce] auto-captured incoming view-once to self chat ✓');
      return;
    }

    // ── Trigger B: Reply to a view-once (passive, non-command) ────────
    const contextInfo =
      rawMsg.extendedTextMessage?.contextInfo ||
      rawMsg.imageMessage?.contextInfo ||
      rawMsg.videoMessage?.contextInfo ||
      rawMsg.audioMessage?.contextInfo ||
      rawMsg.stickerMessage?.contextInfo ||
      rawMsg.documentMessage?.contextInfo ||
      null;

    if (!contextInfo?.quotedMessage) return;

    if (!isViewOnceMessage(contextInfo.quotedMessage)) return;

    // Check if this is an explicit view-once command (e.g. !vv, .vv, vv, !viewonce, etc.)
    // If so, let the dedicated viewonce command handle it in-chat.
    const body = (
      rawMsg.conversation ||
      rawMsg.extendedTextMessage?.text ||
      rawMsg.imageMessage?.caption ||
      ''
    ).trim();
    const firstWord = body.replace(/^[!.\/]/, '').trim().split(/\s+/)[0]?.toLowerCase();
    const isExplicitVVCommand = ['vv', 'vo', 'rvo', 'viewonce', 'antiviewonce', 'readviewonce'].includes(firstWord);
    if (isExplicitVVCommand) {
      return;
    }

    const info = extractMediaType(contextInfo.quotedMessage);
    if (!info) return;

    const fallbackTarget = {
      key: {
        remoteJid: msg.key.remoteJid,
        id: contextInfo.stanzaId,
        participant: contextInfo.participant,
        fromMe: false
      },
      message: info.holder
    };

    const buffer = await downloadMediaBuffer(info, fallbackTarget, sock);
    if (!buffer) return;

    const selfBareJid = resolveSelfBareJid(sock);
    if (!selfBareJid) return;

    const senderName = msg.pushName || (contextInfo.participant || msg.key.remoteJid).split('@')[0];
    const chatLabel = msg.key.remoteJid.endsWith('@g.us') ? msg.key.remoteJid : 'DM';
    const caption = `🔓 *view once unlocked*\n👤 from: ${senderName}\n💬 chat: ${chatLabel}`;

    if (info.type === 'video') {
      await sock.sendMessage(selfBareJid, { video: buffer, caption });
    } else if (info.type === 'audio') {
      await sock.sendMessage(selfBareJid, {
        audio: buffer,
        mimetype: info.node?.mimetype || 'audio/ogg; codecs=opus',
        ptt: info.node?.ptt === true
      });
    } else {
      await sock.sendMessage(selfBareJid, { image: buffer, caption });
    }
    logger.info('[AntiViewOnce] reply-triggered view-once saved to self chat ✓');

  } catch (err) {
    logger.error({ err }, '[AntiViewOnce] unhandled error');
  }
}
