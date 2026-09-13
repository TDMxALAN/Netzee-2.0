/**
 * groupUtils.js
 * Helper utilities for WhatsApp group operations.
 */

/**
 * Fetches group metadata and checks whether the bot is an admin.
 * @param {object} sock - Baileys WASocket instance
 * @param {string} groupJid - The group JID (ends with @g.us)
 * @returns {Promise<{ isAdmin: boolean, metadata: object }>}
 */
export async function getBotAdminStatus(sock, groupJid) {
  try {
    const metadata = await sock.groupMetadata(groupJid);
    const botJid = sock.user?.id;

    // Normalize bot JID (Baileys sometimes has :XX suffix)
    const botNumber = botJid?.split(':')[0]?.split('@')[0];

    const botParticipant = metadata.participants.find(p => {
      const participantNumber = p.id?.split(':')[0]?.split('@')[0];
      return participantNumber === botNumber;
    });

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
  const senderNumber = senderJid.split(':')[0].split('@')[0];
  const participant = metadata.participants.find(p => {
    const pNumber = p.id?.split(':')[0]?.split('@')[0];
    return pNumber === senderNumber;
  });
  return participant?.admin === 'admin' || participant?.admin === 'superadmin';
}
