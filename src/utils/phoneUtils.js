import config from '../config/config.js';

/**
 * Phone Utility Module
 * Parses, validates, and formats phone numbers from various user input formats:
 * - "+94 72 266 6467" -> International with plus and spaces
 * - "94722666467"    -> International without plus or spaces
 * - "0722666467"     -> Local format starting with 0
 */

/**
 * Normalizes an input string by stripping formatting characters (+, -, spaces, parentheses).
 * Converts local numbers (e.g., 0722666467) to international digits using the configured default country code.
 *
 * @param {string} input - Raw phone number string from user command
 * @param {string} [defaultCountryCode=config.defaultCountryCode] - Fallback country code (e.g. "94")
 * @returns {string|null} - Cleaned numeric string (e.g., "94722666467") or null if invalid
 */
export function normalizePhoneNumber(input, defaultCountryCode = config.defaultCountryCode) {
  if (!input || typeof input !== 'string') {
    return null;
  }

  // Remove spaces, plus signs, hyphens, brackets, and non-digit characters except leading
  let digits = input.trim().replace(/[^\d]/g, '');

  if (!digits) {
    return null;
  }

  // Handle local format starting with single '0' (e.g. 0722666467 -> 94722666467)
  if (digits.startsWith('0') && digits.length >= 9 && digits.length <= 11) {
    digits = defaultCountryCode + digits.slice(1);
  }

  return digits;
}

/**
 * Validates whether the normalized phone number is a realistic WhatsApp phone number.
 * WhatsApp numbers consist of 10 to 15 digits (E.164 standard length without plus).
 *
 * @param {string} rawInput - Raw input phone number
 * @returns {boolean} - True if valid, false otherwise
 */
export function isValidPhoneNumber(rawInput) {
  const digits = normalizePhoneNumber(rawInput);
  if (!digits) return false;

  // E.164 standard: minimum 10 digits (including country code), max 15 digits
  const phoneRegex = /^[1-9]\d{9,14}$/;
  return phoneRegex.test(digits);
}

/**
 * Converts any supported phone format into a standard WhatsApp JID format (<number>@s.whatsapp.net).
 *
 * @param {string} rawInput - Raw phone number input (e.g., "+94 72 266 6467", "94722666467", "0722666467")
 * @returns {string|null} - Standard WhatsApp JID or null if invalid
 */
export function formatToJid(rawInput) {
  const digits = normalizePhoneNumber(rawInput);
  if (!digits || !isValidPhoneNumber(digits)) {
    return null;
  }
  return `${digits}@s.whatsapp.net`;
}

/**
 * Formats a phone number into readable international format (+94 72 266 6467).
 *
 * @param {string} rawInput - Raw phone number input
 * @returns {string|null} - Formatted string like "+94 72 266 6467" or null
 */
export function formatToInternational(rawInput) {
  const digits = normalizePhoneNumber(rawInput);
  if (!digits || !isValidPhoneNumber(digits)) {
    return null;
  }
  return `+${digits}`;
}

/**
 * Full parsing result containing validation status, digits, formatted string, and WhatsApp JID.
 *
 * @param {string} rawInput - Raw user input string
 * @returns {object} - Object with parsed details
 */
export function parsePhoneNumber(rawInput) {
  const digits = normalizePhoneNumber(rawInput);
  const isValid = isValidPhoneNumber(rawInput);
  const jid = isValid ? formatToJid(rawInput) : null;
  const international = isValid ? formatToInternational(rawInput) : null;

  return {
    rawInput,
    digits,
    isValid,
    jid,
    international
  };
}

export default {
  normalizePhoneNumber,
  isValidPhoneNumber,
  formatToJid,
  formatToInternational,
  parsePhoneNumber
};
