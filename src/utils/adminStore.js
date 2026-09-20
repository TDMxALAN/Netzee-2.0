import fs from 'fs';
import path from 'path';
import config from '../config/config.js';
import { normalizePhoneNumber } from './phoneUtils.js';

/**
 * adminStore.js
 * Bot-level admin management (not group-level).
 *
 * Hierarchy:
 *  • Super Admin  — hardcoded (+94722666467). Cannot be removed. Cannot promote others to super admin.
 *  • Bot Admin    — numbers added via .promote. Can be removed via .demote.
 *
 * Who can manage admins?
 *  • The super admin
 *  • The bot's own number (identified via sock.user at runtime)
 *
 * Persistence: Saved in config.userDataDir/adminStore.json (/data/userdata/adminStore.json)
 */

const DATA_DIR = config.userDataDir || './data/userdata';
const STORE_FILE = path.join(DATA_DIR, 'adminStore.json');

// ── Super Admin ──────────────────────────────────────────────────────────────
// Normalize once at startup to ensure consistent comparison (no + or spaces).
const SUPER_ADMIN_DIGITS = normalizePhoneNumber(
  process.env.SUPER_ADMIN || config.ownerNumber || '94722666467'
);

// ── Bot Admins (mutable & persistent) ─────────────────────────────────────────
// Stored as normalized digit-only strings (e.g. "94722666467").
const botAdmins = new Set();

function ensureStore() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(STORE_FILE)) {
      fs.writeFileSync(STORE_FILE, JSON.stringify([], null, 2), 'utf-8');
    }
  } catch (e) {
    // Ignore error
  }
}

function loadStore() {
  ensureStore();
  try {
    if (fs.existsSync(STORE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
      if (Array.isArray(data)) {
        data.forEach(d => botAdmins.add(d));
      }
    }
  } catch (e) {
    // Ignore error
  }
}

function saveStore() {
  ensureStore();
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(Array.from(botAdmins), null, 2), 'utf-8');
  } catch (e) {
    // Ignore error
  }
}

// Initial load
loadStore();

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns the normalized digit-only string for a phone number or JID.
 * Accepts: "+94 72 266 6467", "94722666467", "0722666467", "94722666467@s.whatsapp.net"
 *
 * @param {string} input
 * @returns {string|null}
 */
function toDigits(input) {
  if (!input || typeof input !== 'string') return null;
  // Strip JID suffix if present (e.g. @s.whatsapp.net, @c.us, :device suffix)
  const withoutJid = input.split('@')[0].split(':')[0];
  return normalizePhoneNumber(withoutJid);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the normalized super admin digit string.
 * @returns {string}
 */
export function getSuperAdminDigits() {
  return SUPER_ADMIN_DIGITS;
}

/**
 * Checks if a given number/JID is the super admin.
 *
 * @param {string} input - Raw number or JID
 * @returns {boolean}
 */
export function isSuperAdmin(input) {
  const digits = toDigits(input);
  return !!digits && digits === SUPER_ADMIN_DIGITS;
}

/**
 * Checks if a given number/JID is a promoted bot admin (not super admin).
 *
 * @param {string} input - Raw number or JID
 * @returns {boolean}
 */
export function isBotAdmin(input) {
  const digits = toDigits(input);
  return !!digits && botAdmins.has(digits);
}

/**
 * Checks if a given number/JID has any admin privilege (super admin OR bot admin).
 *
 * @param {string} input - Raw number or JID
 * @returns {boolean}
 */
export function isAdmin(input) {
  return isSuperAdmin(input) || isBotAdmin(input);
}

/**
 * Checks if the sender is authorized to manage the bot's admin list.
 * Authorized parties: super admin OR the bot's own number.
 *
 * @param {string} senderInput   - Sender JID or phone number
 * @param {string|null} botJid   - The bot's own JID from sock.user?.id (optional)
 * @returns {boolean}
 */
export function canManageAdmins(senderInput, botJid = null) {
  if (isSuperAdmin(senderInput)) return true;
  if (botJid) {
    const botDigits = toDigits(botJid);
    const senderDigits = toDigits(senderInput);
    if (botDigits && senderDigits && botDigits === senderDigits) return true;
  }
  return false;
}

/**
 * Promotes a phone number to bot admin.
 * Returns 'already_admin' | 'is_super_admin' | 'promoted'
 *
 * @param {string} input - Raw phone number
 * @returns {'already_admin' | 'is_super_admin' | 'promoted' | 'invalid'}
 */
export function promoteAdmin(input) {
  const digits = toDigits(input);
  if (!digits) return 'invalid';
  if (digits === SUPER_ADMIN_DIGITS) return 'is_super_admin';
  if (botAdmins.has(digits)) return 'already_admin';
  botAdmins.add(digits);
  saveStore();
  return 'promoted';
}

/**
 * Demotes a phone number from bot admin.
 * Returns 'not_admin' | 'is_super_admin' | 'demoted'
 *
 * @param {string} input - Raw phone number
 * @returns {'not_admin' | 'is_super_admin' | 'demoted' | 'invalid'}
 */
export function demoteAdmin(input) {
  const digits = toDigits(input);
  if (!digits) return 'invalid';
  if (digits === SUPER_ADMIN_DIGITS) return 'is_super_admin';
  if (!botAdmins.has(digits)) return 'not_admin';
  botAdmins.delete(digits);
  saveStore();
  return 'demoted';
}

/**
 * Returns the current list of promoted bot admins (excludes super admin).
 *
 * @returns {string[]} Array of normalized digit strings
 */
export function listBotAdmins() {
  return Array.from(botAdmins);
}

export default {
  getSuperAdminDigits,
  isSuperAdmin,
  isBotAdmin,
  isAdmin,
  canManageAdmins,
  promoteAdmin,
  demoteAdmin,
  listBotAdmins
};
