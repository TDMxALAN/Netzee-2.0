import { downloadMediaMessage, downloadContentFromMessage } from '@whiskeysockets/baileys';
import logger from './logger.js';

const _silent = {
  level: 'silent',
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  trace: () => {},
  child() { return this; }
};

/**
 * Recursively unwraps wrappers like ephemeralMessage, viewOnceMessage,
 * viewOnceMessageV2, viewOnceMessageV2Extension, documentWithCaptionMessage, editedMessage
 * to reveal the inner content.
 *
 * @param {object} message
 * @returns {object|null}
 */
export function unwrapMessage(message) {
  if (!message) return null;
  let m = message;
  let unwrapped = true;

  while (unwrapped && m) {
    unwrapped = false;
    if (m.ephemeralMessage?.message) {
      m = m.ephemeralMessage.message;
      unwrapped = true;
    } else if (m.viewOnceMessage?.message) {
      m = m.viewOnceMessage.message;
      unwrapped = true;
    } else if (m.viewOnceMessageV2?.message) {
      m = m.viewOnceMessageV2.message;
      unwrapped = true;
    } else if (m.viewOnceMessageV2Extension?.message) {
      m = m.viewOnceMessageV2Extension.message;
      unwrapped = true;
    } else if (m.documentWithCaptionMessage?.message) {
      m = m.documentWithCaptionMessage.message;
      unwrapped = true;
    } else if (m.editedMessage?.message) {
      m = m.editedMessage.message;
      unwrapped = true;
    }
  }

  return m;
}

/**
 * Checks whether a message object is a view-once message (directly or nested).
 * Handles viewOnceMessage, viewOnceMessageV2, viewOnceMessageV2Extension,
 * ephemeral wrappers, and inner viewOnce flags.
 *
 * @param {object} message
 * @returns {boolean}
 */
export function isViewOnceMessage(message) {
  if (!message) return false;

  // Direct wrapper check
  if (
    message.viewOnceMessage ||
    message.viewOnceMessageV2 ||
    message.viewOnceMessageV2Extension
  ) {
    return true;
  }

  // Check inside ephemeral or documentWithCaption wrappers
  if (message.ephemeralMessage?.message) {
    if (isViewOnceMessage(message.ephemeralMessage.message)) return true;
  }
  if (message.documentWithCaptionMessage?.message) {
    if (isViewOnceMessage(message.documentWithCaptionMessage.message)) return true;
  }

  // Check unwrapped inner media node for viewOnce flag
  const inner = unwrapMessage(message);
  if (inner) {
    if (inner.imageMessage?.viewOnce) return true;
    if (inner.videoMessage?.viewOnce) return true;
    if (inner.audioMessage?.viewOnce) return true;
  }

  return false;
}

/**
 * Extracts the inner media details from an unwrapped or wrapped message.
 * Returns { type: 'image' | 'video' | 'audio' | 'document', node: object, holder: object } or null.
 *
 * @param {object} message
 * @returns {{ type: string, node: object, holder: object } | null}
 */
export function extractMediaType(message) {
  if (!message) return null;
  const m = unwrapMessage(message);
  if (!m) return null;

  if (m.imageMessage) return { type: 'image', node: m.imageMessage, holder: m };
  if (m.videoMessage) return { type: 'video', node: m.videoMessage, holder: m };
  if (m.audioMessage) return { type: 'audio', node: m.audioMessage, holder: m };
  if (m.documentMessage) return { type: 'document', node: m.documentMessage, holder: m };
  if (m.stickerMessage) return { type: 'sticker', node: m.stickerMessage, holder: m };

  return null;
}

/**
 * Downloads media buffer from a view-once message node.
 * Uses downloadContentFromMessage as primary method and falls back to downloadMediaMessage.
 *
 * @param {object} info - { type, node, holder }
 * @param {object} [fallbackTarget] - { key, message } object for downloadMediaMessage
 * @param {object} [sock] - WASocket instance
 * @returns {Promise<Buffer|null>}
 */
export async function downloadMediaBuffer(info, fallbackTarget, sock) {
  const { node, type } = info;

  // Method 1: downloadContentFromMessage directly on media node
  try {
    if (typeof downloadContentFromMessage === 'function') {
      const stream = await downloadContentFromMessage(node, type);
      let buffer = Buffer.from([]);
      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
      }
      if (buffer && buffer.length > 0) {
        return buffer;
      }
    }
  } catch (err) {
    logger.warn({ err: err.message, type }, '[ViewOnceUtils] downloadContentFromMessage failed, trying fallback');
  }

  // Method 2: downloadMediaMessage fallback
  try {
    if (typeof downloadMediaMessage === 'function') {
      const target = fallbackTarget || { message: info.holder };
      const buffer = await downloadMediaMessage(
        target,
        'buffer',
        {},
        {
          logger: _silent,
          reuploadRequest: sock?.updateMediaMessage ? sock.updateMediaMessage.bind(sock) : undefined
        }
      );
      if (buffer && buffer.length > 0) {
        return buffer;
      }
    }
  } catch (err) {
    logger.error({ err: err.message, type }, '[ViewOnceUtils] downloadMediaMessage fallback failed');
  }

  return null;
}

/**
 * Resolves the bot's bare self-chat JID (e.g. 94722666467@s.whatsapp.net).
 * Strips device suffixes like :12.
 *
 * @param {object} sock - WASocket instance
 * @returns {string|null}
 */
export function resolveSelfBareJid(sock) {
  const selfJid = sock?.user?.id;
  if (!selfJid) return null;
  return selfJid.includes(':')
    ? selfJid.split(':')[0] + '@s.whatsapp.net'
    : selfJid;
}

export default {
  unwrapMessage,
  isViewOnceMessage,
  extractMediaType,
  downloadMediaBuffer,
  resolveSelfBareJid
};
