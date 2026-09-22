import {
  toDigits,
  getSuperAdminDigits,
  isSuperAdmin,
  isBotAdmin,
  isAdmin,
  canManageAdmins,
  promoteAdmin,
  demoteAdmin,
  listBotAdmins
} from '../src/utils/adminStore.js';
import { parsePhoneNumber, normalizePhoneNumber } from '../src/utils/phoneUtils.js';

console.log('=== Running Admin Store & Utility Tests ===\n');

// 1. Super Admin tests
console.log('1. Super Admin Identification:');
console.log('  Super admin digits:', getSuperAdminDigits());

const superAdminCases = [
  '+94 72 266 6467',
  '94722666467',
  '0722666467',
  '94722666467@s.whatsapp.net',
  '94722666467:14@s.whatsapp.net',
  '@94722666467'
];

superAdminCases.forEach(input => {
  const result = isSuperAdmin(input);
  console.log(`  isSuperAdmin("${input}") => ${result}`);
  if (!result) console.error(`  ❌ FAILED for ${input}`);
});

// 2. Reject group JIDs
console.log('\n2. Group JID rejection test:');
const groupJid = '120363041234567890@g.us';
console.log(`  toDigits("${groupJid}") =>`, toDigits(groupJid));
console.log(`  isSuperAdmin("${groupJid}") =>`, isSuperAdmin(groupJid));
console.log(`  isAdmin("${groupJid}") =>`, isAdmin(groupJid));

// 3. Promote & Demote tests
console.log('\n3. Promoting & Demoting Bot Admins:');
const testUser = '0771234567'; // Sri Lankan local format
const testUserDigits = normalizePhoneNumber(testUser);
console.log(`  Test user: ${testUser} -> normalized: ${testUserDigits}`);

console.log('  Promoting test user:', promoteAdmin(testUser));
console.log('  isBotAdmin(testUser):', isBotAdmin(testUser));
console.log('  isBotAdmin("94771234567@s.whatsapp.net"):', isBotAdmin('94771234567@s.whatsapp.net'));
console.log('  isAdmin("94771234567"):', isAdmin('94771234567'));
console.log('  Current bot admins:', listBotAdmins());

console.log('  Demoting test user:', demoteAdmin('94771234567@s.whatsapp.net'));
console.log('  isBotAdmin(testUser) after demote:', isBotAdmin(testUser));
console.log('  Current bot admins after demote:', listBotAdmins());

// 4. canManageAdmins & isSuperAdmin self-message tests
console.log('\n4. canManageAdmins & isSuperAdmin tests:');
console.log('  Super admin manage check:', canManageAdmins('94722666467@s.whatsapp.net'));
console.log('  Self-message (isFromMe=true) check for non-super-admin bot:', isSuperAdmin('94701234567@s.whatsapp.net', true, '94701234567@s.whatsapp.net'));
console.log('  Super admin +94722666467 check:', isSuperAdmin('94722666467@s.whatsapp.net', false, null));
console.log('  Random user check (isFromMe=false):', canManageAdmins('94779998888@s.whatsapp.net', null, false));

console.log('\n=== All Tests Finished ===');
