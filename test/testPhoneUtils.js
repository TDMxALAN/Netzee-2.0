import { parsePhoneNumber, isValidPhoneNumber, formatToJid } from '../src/utils/phoneUtils.js';

console.log('--- Testing Phone Utility Module ---');

const testCases = [
  '+94 72 266 6467',
  '94722666467',
  '0722666467',
  'invalid_number',
  '123'
];

testCases.forEach((input) => {
  const result = parsePhoneNumber(input);
  console.log(`Input: "${input}"`);
  console.log(`  Valid: ${result.isValid}`);
  console.log(`  Digits: ${result.digits}`);
  console.log(`  JID: ${result.jid}`);
  console.log(`  International: ${result.international}`);
  console.log('-----------------------------------');
});
