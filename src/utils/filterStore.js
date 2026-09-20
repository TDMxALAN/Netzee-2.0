import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store file lives in config.userDataDir (/data/userdata)
const DATA_DIR = config.userDataDir || path.join(__dirname, '../data');
const STORE_FILE = path.join(DATA_DIR, 'filterStore.json');

/**
 * filterStore — Persistent word-filter storage per group JID.
 *
 * Schema (filterStore.json):
 * {
 *   "<groupJid>": {
 *     "enabled": true,
 *     "words": ["badword1", "badword2"]
 *   }
 * }
 */

/** Ensure data directory and store file exist. */
function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(STORE_FILE, JSON.stringify({}, null, 2), 'utf-8');
  }
}

/** Read the full store from disk. */
function readStore() {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

/** Write the full store to disk. */
function writeStore(data) {
  ensureStore();
  fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

/** Get or create the default entry for a group. */
function getGroup(store, groupJid) {
  if (!store[groupJid]) {
    store[groupJid] = { enabled: false, words: [] };
  }
  return store[groupJid];
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/**
 * Returns the current filter config for a group.
 * @param {string} groupJid
 * @returns {{ enabled: boolean, words: string[] }}
 */
export function getFilterConfig(groupJid) {
  const store = readStore();
  return getGroup(store, groupJid);
}

/**
 * Add words to the banned list for a group.
 * Automatically enables the filter.
 * @param {string} groupJid
 * @param {string[]} words
 * @returns {string[]} The words that were actually newly added
 */
export function addWords(groupJid, words) {
  const store = readStore();
  const group = getGroup(store, groupJid);
  const normalized = words.map(w => w.toLowerCase().trim()).filter(Boolean);
  const added = [];
  for (const word of normalized) {
    if (!group.words.includes(word)) {
      group.words.push(word);
      added.push(word);
    }
  }
  if (added.length > 0) {
    group.enabled = true; // Adding a word auto-enables the filter
  }
  writeStore(store);
  return added;
}

/**
 * Remove words from the banned list for a group.
 * @param {string} groupJid
 * @param {string[]} words
 * @returns {string[]} The words that were actually removed
 */
export function removeWords(groupJid, words) {
  const store = readStore();
  const group = getGroup(store, groupJid);
  const normalized = words.map(w => w.toLowerCase().trim()).filter(Boolean);
  const removed = [];
  group.words = group.words.filter(w => {
    if (normalized.includes(w)) {
      removed.push(w);
      return false;
    }
    return true;
  });
  writeStore(store);
  return removed;
}

/**
 * Remove words by their 1-based index positions in the banned list.
 * @param {string} groupJid
 * @param {number[]} indices - 1-based indices
 * @returns {string[]} The words that were removed
 */
export function removeWordsByIndex(groupJid, indices) {
  const store = readStore();
  const group = getGroup(store, groupJid);
  const removed = [];
  const zeroBasedIndices = indices.map(i => i - 1);
  const remaining = group.words.filter((w, i) => {
    if (zeroBasedIndices.includes(i)) {
      removed.push(w);
      return false;
    }
    return true;
  });
  group.words = remaining;
  writeStore(store);
  return removed;
}

/**
 * Set the filter enabled/disabled state for a group.
 * @param {string} groupJid
 * @param {boolean} enabled
 */
export function setFilterEnabled(groupJid, enabled) {
  const store = readStore();
  const group = getGroup(store, groupJid);
  group.enabled = enabled;
  writeStore(store);
}

/**
 * Check if a message body contains any banned word for a group.
 * Uses whole-word matching (word boundaries).
 * @param {string} groupJid
 * @param {string} text
 * @returns {string|null} The matched banned word, or null
 */
export function findBannedWord(groupJid, text) {
  const { enabled, words } = getFilterConfig(groupJid);
  if (!enabled || words.length === 0) return null;
  const lower = text.toLowerCase();
  for (const word of words) {
    // Match whole-word occurrences (handles punctuation boundaries too)
    const regex = new RegExp(`(?<![\\w])${escapeRegex(word)}(?![\\w])`, 'i');
    if (regex.test(lower)) return word;
  }
  return null;
}

/** Escape special regex characters in a string. */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
