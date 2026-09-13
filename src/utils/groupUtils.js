import { jidNormalizedUser } from '@whiskeysockets/baileys';
import logger from './logger.js';

/**
 * groupUtils.js
 * Helper utilities for WhatsApp group operations.
 */

/**
 * Fetches group metadata and checks whether the bot is an admin.
 * Uses jidNormalizedUser to reliably strip device suffixes (e.g. :12@s.whatsapp.net → @s.whatsapp.net).
 * @param {object} sock - Baileys WASocket instance
 * @param {string} groupJid - The group JID (ends with @g.us)
 * @returns {Promise<{ isAdmin: boolean, metadata: object }>}
 */
export async function getBotAdminStatus(sock, groupJid) {
  try {
    const metadata = await sock.groupMetadata(groupJid);
    const rawBotId = sock.user?.id;
    const botJid = jidNormalizedUser(rawBotId);

    // ── DEBUG: log raw bot JID and all participant entries ──
    logger.info({
      rawBotId,
      normalizedBotJid: botJid,
      participants: metadata.participants.map(p => ({
        id: p.id,
        normalized: jidNormalizedUser(p.id),
        admin: p.admin
      }))
    }, '[groupUtils] getBotAdminStatus debug');

    const botParticipant = metadata.participants.find(p =>
      jidNormalizedUser(p.id) === botJid
    );

    const isAdmin =
      botParticipant?.admin === 'admin' ||
      botParticipant?.admin === 'superadmin';

    logger.info({ botJid, foundParticipant: botParticipant, isAdmin }, '[groupUtils] result');

    return { isAdmin, metadata };
  } catch (err) {
    logger.error({ err }, '[groupUtils] getBotAdminStatus error');
    return { isAdmin: false, metadata: null };
  }
}

/**
 * Checks whether the sender of a message is a group admin or superadmin.
 * @param {object} metadata - Group metadata from sock.groupMetadata()
 * @param {string} senderJid - Full JID of the sender
 * @returns {boolean}
 */
export function isSenderAdmin(metadata, senderJid) {
  if (!metadata || !senderJid) return false;
  const normalizedSender = jidNormalizedUser(senderJid);
  const participant = metadata.participants.find(p =>
    jidNormalizedUser(p.id) === normalizedSender
  );
  return participant?.admin === 'admin' || participant?.admin === 'superadmin';
}
