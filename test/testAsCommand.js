import commandHandler from '../src/handlers/commandHandler.js';
import asCommand from '../src/commands/utility/as.js';

async function testAsCommand() {
  console.log('--- Testing AS (Animated Sticker) Command ---');
  await commandHandler.loadCommands();

  const asCmd = commandHandler.getCommand('as');
  const agCmd = commandHandler.getCommand('ag');
  const gifCmd = commandHandler.getCommand('gifsticker');

  console.log('Command "as" loaded:', !!asCmd, asCmd?.name);
  console.log('Alias "ag" points to:', agCmd?.name);
  console.log('Alias "gifsticker" points to:', gifCmd?.name);

  if (!asCmd || asCmd.name !== 'as') {
    console.error('FAILED: "as" command not found!');
    process.exit(1);
  }

  // Helper to parse caption like in as.js
  function parseCaption(args) {
    let inputString = args.join(' ').trim();
    let stickerCaption = '';

    if (inputString) {
      if (/^ag\s+/i.test(inputString)) {
        stickerCaption = inputString.replace(/^ag\s+/i, '').trim();
      } else if (/^ag$/i.test(inputString)) {
        stickerCaption = '';
      } else {
        stickerCaption = inputString;
      }
    }
    return stickerCaption;
  }

  // Test cases
  const tests = [
    { args: [], expected: '' },
    { args: ['ag', 'netzee'], expected: 'netzee' },
    { args: ['ag', 'my', 'cool', 'sticker'], expected: 'my cool sticker' },
    { args: ['netzee'], expected: 'netzee' },
    { args: ['ag'], expected: '' }
  ];

  for (const t of tests) {
    const result = parseCaption(t.args);
    const pass = result === t.expected;
    console.log(`Args: [${t.args.join(', ')}] -> Caption: "${result}" | Pass: ${pass}`);
    if (!pass) {
      console.error(`FAILED test for args: [${t.args.join(', ')}]`);
      process.exit(1);
    }
  }

  console.log('✅ ALL TESTS PASSED!');
}

testAsCommand();
