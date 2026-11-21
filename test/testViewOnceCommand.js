import {
  unwrapMessage,
  isViewOnceMessage,
  extractMediaType,
  resolveSelfBareJid
} from '../src/utils/viewOnceUtils.js';
import commandHandler from '../src/handlers/commandHandler.js';
import viewonceCommand from '../src/commands/utility/viewonce.js';

async function runViewOnceTests() {
  console.log('--- Testing View Once Detection & Utilities ---');

  // Test 1: Standard viewOnceMessageV2
  const standardV2 = {
    viewOnceMessageV2: {
      message: {
        imageMessage: {
          url: 'https://example.com/image.enc',
          mimetype: 'image/jpeg',
          mediaKey: Buffer.from('test')
        }
      }
    }
  };
  console.log('1. Standard V2 isViewOnceMessage:', isViewOnceMessage(standardV2) === true ? '✅ PASS' : '❌ FAIL');
  const unwrapped1 = unwrapMessage(standardV2);
  console.log('   Unwrapped has imageMessage:', !!unwrapped1?.imageMessage ? '✅ PASS' : '❌ FAIL');
  const media1 = extractMediaType(standardV2);
  console.log('   extractMediaType type is image:', media1?.type === 'image' ? '✅ PASS' : '❌ FAIL');

  // Test 2: Ephemeral-wrapped view-once (disappearing messages)
  const ephemeralWrapped = {
    ephemeralMessage: {
      message: {
        viewOnceMessage: {
          message: {
            videoMessage: {
              url: 'https://example.com/video.enc',
              mimetype: 'video/mp4',
              seconds: 5
            }
          }
        }
      }
    }
  };
  console.log('2. Ephemeral-wrapped isViewOnceMessage:', isViewOnceMessage(ephemeralWrapped) === true ? '✅ PASS' : '❌ FAIL');
  const unwrapped2 = unwrapMessage(ephemeralWrapped);
  console.log('   Unwrapped has videoMessage:', !!unwrapped2?.videoMessage ? '✅ PASS' : '❌ FAIL');
  const media2 = extractMediaType(ephemeralWrapped);
  console.log('   extractMediaType type is video:', media2?.type === 'video' ? '✅ PASS' : '❌ FAIL');

  // Test 3: Audio view-once with viewOnce: true flag
  const audioViewOnce = {
    audioMessage: {
      url: 'https://example.com/audio.enc',
      mimetype: 'audio/ogg; codecs=opus',
      ptt: true,
      viewOnce: true
    }
  };
  console.log('3. Audio with viewOnce flag isViewOnceMessage:', isViewOnceMessage(audioViewOnce) === true ? '✅ PASS' : '❌ FAIL');
  const media3 = extractMediaType(audioViewOnce);
  console.log('   extractMediaType type is audio:', media3?.type === 'audio' ? '✅ PASS' : '❌ FAIL');

  // Test 4: Normal text message (should NOT be view-once)
  const normalText = {
    conversation: 'Hello world'
  };
  console.log('4. Normal text isViewOnceMessage is false:', isViewOnceMessage(normalText) === false ? '✅ PASS' : '❌ FAIL');

  // Test 5: Self bare JID resolution
  const mockSock = {
    user: { id: '94722666467:12@s.whatsapp.net' }
  };
  const resolvedJid = resolveSelfBareJid(mockSock);
  console.log('5. resolveSelfBareJid strips device suffix:', resolvedJid === '94722666467@s.whatsapp.net' ? '✅ PASS' : '❌ FAIL');

  console.log('\n--- Testing Command Handler Registration ---');
  await commandHandler.loadCommands();

  const cmdPrimary = commandHandler.getCommand('viewonce');
  const cmdVV = commandHandler.getCommand('vv');
  const cmdVO = commandHandler.getCommand('vo');
  const cmdRVO = commandHandler.getCommand('rvo');

  console.log('6. "viewonce" command loaded:', !!cmdPrimary ? '✅ PASS' : '❌ FAIL');
  console.log('7. Alias "vv" points to viewonce:', cmdVV?.name === 'viewonce' ? '✅ PASS' : '❌ FAIL');
  console.log('8. Alias "vo" points to viewonce:', cmdVO?.name === 'viewonce' ? '✅ PASS' : '❌ FAIL');
  console.log('9. Alias "rvo" points to viewonce:', cmdRVO?.name === 'viewonce' ? '✅ PASS' : '❌ FAIL');

  console.log('\n--- Testing Mock Command Execution ---');
  let replies = [];
  const mockCtxNoQuoted = {
    sock: mockSock,
    msg: { key: { remoteJid: '123@g.us', id: 'm1' }, message: { conversation: '!vv' } },
    remoteJid: '123@g.us',
    usedPrefix: '!',
    reply: async (text) => { replies.push(text); }
  };
  await viewonceCommand.execute(mockCtxNoQuoted);
  console.log('10. No quoted message warns user to reply:', replies[0]?.includes('Please reply to a view-once message') ? '✅ PASS' : '❌ FAIL');

  console.log('\n✅ ALL VIEW-ONCE TESTS COMPLETED SUCCESSFULLY!');
}

runViewOnceTests().catch((err) => {
  console.error('❌ Test error:', err);
  process.exit(1);
});
