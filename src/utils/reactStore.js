import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parsePhoneNumber } from './phoneUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../data');
const STORE_FILE = path.join(DATA_DIR, 'reactStore.json');

/**
 * reactStore — Persistent emoji reaction rules per phone number (target number digits).
 *
 * Schema (reactStore.json):
 * {
 *   "94722666467": "🎀"
 * }
 */

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(STORE_FILE, JSON.stringify({}, null, 2), 'utf-8');
  }
}

function readStore() {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function writeStore(data) {
  ensureStore();
  fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Sets an emoji reaction for a target phone number.
 *
 * @param {string} rawNumber - Phone number input in any valid format
 * @param {string} emoji - Emoji character to react with
 * @returns {{ success: boolean, digits?: string, parsedNumber?: string, error?: string }}
 */
export function setReactRule(rawNumber, emoji) {
  const parsed = parsePhoneNumber(rawNumber);
  if (!parsed.isValid || !parsed.digits) {
    return { success: false, error: 'invalid_number' };
  }

  const store = readStore();
  store[parsed.digits] = emoji;
  writeStore(store);

  return {
    success: true,
    digits: parsed.digits,
    parsedNumber: parsed.international,
    emoji
  };
}

/**
 * Removes a reaction rule for a target phone number.
 *
 * @param {string} rawNumber - Phone number input in any valid format
 * @returns {{ success: boolean, digits?: string, parsedNumber?: string, error?: string }}
 */
export function removeReactRule(rawNumber) {
  const parsed = parsePhoneNumber(rawNumber);
  if (!parsed.isValid || !parsed.digits) {
    return { success: false, error: 'invalid_number' };
  }

  const store = readStore();
  if (!store[parsed.digits]) {
    return { success: false, error: 'not_found', digits: parsed.digits, parsedNumber: parsed.international };
  }

  delete store[parsed.digits];
  writeStore(store);

  return {
    success: true,
    digits: parsed.digits,
    parsedNumber: parsed.international
  };
}

/**
 * Gets the configured emoji reaction for a given number/digits if one exists.
 *
 * @param {string} digits - Normalized digit-only string (e.g. "94722666467")
 * @returns {string|null} The emoji string, or null
 */
export function getReactEmoji(digits) {
  if (!digits) return null;
  const store = readStore();
  return store[digits] || null;
}

/**
 * Returns all configured react rules.
 *
 * @returns {Record<string, string>} Mapping of digits -> emoji
 */
export function getAllReactRules() {
  return readStore();
}

export default {
  setReactRule,
  removeReactRule,
  getReactEmoji,
  getAllReactRules
};
