import { jidNormalizedUser } from '@whiskeysockets/baileys';
import logger from './logger.js';

/**
 * Compares two JIDs flexibly:
 * 1. Direct string match
 * 2. jidNormalizedUser match
 * 3. Extracted phone digits match (handles :device, @c.us vs @s.whatsapp.net, etc.)
 *
 * @param {string} jid1
 * @param {string} jid2
 * @returns {boolean}
 */
export function areJidsSame(jid1, jid2) {
  if (!jid1 || !jid2) return false;
  if (jid1 === jid2) return true;

  try {
    const norm1 = jidNormalizedUser(jid1);
    const norm2 = jidNormalizedUser(jid2);
    if (norm1 && norm2 && norm1 === norm2) return true;
  } catch (e) {}

  const extractDigits = (jid) => {
    if (typeof jid !== 'string') return '';
    const userPart = jid.split('@')[0].split(':')[0];
    return userPart.replace(/\D/g, '');
  };

  const digits1 = extractDigits(jid1);
  const digits2 = extractDigits(jid2);

  if (digits1 && digits2 && digits1 === digits2) {
    return true;
  }

  return false;
}

/**
 * Fetches group metadata and checks whether the bot is an admin.
 * @param {object} sock - Baileys WASocket instance
 * @param {string} groupJid - The group JID (ends with @g.us)
 * @returns {Promise<{ isAdmin: boolean, metadata: object }>}
 */
export async function getBotAdminStatus(sock, groupJid) {
  try {
    const metadata = await sock.groupMetadata(groupJid);
    const botCandidateIds = [sock.user?.id, sock.user?.lid, sock.user?.jid].filter(Boolean);

    const botParticipant = metadata.participants.find(p =>
      botCandidateIds.some(botId => areJidsSame(p.id, botId) || areJidsSame(p.jid, botId))
    );

    const isAdmin =
      botParticipant?.admin === 'admin' ||
      botParticipant?.admin === 'superadmin';

    logger.info(
      {
        botCandidateIds,
        foundBotParticipant: botParticipant ? { id: botParticipant.id, admin: botParticipant.admin } : null,
        isAdmin
      },
      '[groupUtils] getBotAdminStatus check'
    );

    return { isAdmin, metadata };
  } catch (err) {
    logger.error({ err, groupJid }, '[groupUtils] getBotAdminStatus error');
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

  const participant = metadata.participants.find(p =>
    areJidsSame(p.id, senderJid) || areJidsSame(p.jid, senderJid)
  );

  return participant?.admin === 'admin' || participant?.admin === 'superadmin';
}

