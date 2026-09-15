import { setReactRule, removeReactRule, getReactEmoji, getAllReactRules } from '../src/utils/reactStore.js';
import { parsePhoneNumber } from '../src/utils/phoneUtils.js';

console.log('--- Testing React Store & Phone Utilities ---');

// Test 1: Set react rule with different phone formats
console.log('\n1. Testing react set with various formats:');
const testSet1 = setReactRule('94722666467', '🎀');
console.log('  Format 94722666467:', testSet1);

const testSet2 = setReactRule('+94 72 266 6467', '🔥');
console.log('  Format +94 72 266 6467:', testSet2);

const testSet3 = setReactRule('0722666467', '💖');
console.log('  Format 0722666467:', testSet3);

// Test 2: Check active emoji for normalized digits
console.log('\n2. Testing getReactEmoji:');
const emojiResult = getReactEmoji('94722666467');
console.log('  Emoji for 94722666467:', emojiResult);

// Test 3: List rules
console.log('\n3. Testing getAllReactRules:');
console.log('  All rules:', getAllReactRules());

// Test 4: Remove rule
console.log('\n4. Testing react remove:');
const removeRes = removeReactRule('+94 72 266 6467');
console.log('  Remove result:', removeRes);
console.log('  Emoji after remove:', getReactEmoji('94722666467'));
console.log('  Rules after remove:', getAllReactRules());

// Clean up store file created during test
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORE_FILE = path.join(__dirname, '../src/data/reactStore.json');
if (fs.existsSync(STORE_FILE)) {
  fs.unlinkSync(STORE_FILE);
}
console.log('\nCleaned up test store file.');
