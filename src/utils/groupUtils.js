import { jidNormalizedUser } from '@whiskeysockets/baileys';

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
    const botJid = jidNormalizedUser(sock.user?.id);

    const botParticipant = metadata.participants.find(p =>
      jidNormalizedUser(p.id) === botJid
    );

    const isAdmin =
      botParticipant?.admin === 'admin' ||
      botParticipant?.admin === 'superadmin';

    return { isAdmin, metadata };
  } catch {
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
