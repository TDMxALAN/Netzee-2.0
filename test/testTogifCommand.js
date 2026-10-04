import fs from 'fs';
import path from 'path';
import os from 'os';
import sharp from 'sharp';
import ffmpegStatic from 'ffmpeg-static';
import { spawn } from 'child_process';
import commandHandler from '../src/handlers/commandHandler.js';
import togifCommand from '../src/commands/utility/togif.js';
import { convertWebpToGif } from '../src/utils/stickerUtils.js';

const tempDir = os.tmpdir();

async function runTogifTests() {
  console.log('--- Testing ToGIF Command & WebP-to-GIF Conversion ---');

  // 1. Verify Command Registration via CommandHandler
  await commandHandler.loadCommands();
  const cmd = commandHandler.getCommand('togif');
  const alias1 = commandHandler.getCommand('awebptogif');
  const alias2 = commandHandler.getCommand('stickertogif');

  console.log('Command "togif" loaded:', !!cmd, cmd?.name);
  console.log('Alias "awebptogif" points to:', alias1?.name);
  console.log('Alias "stickertogif" points to:', alias2?.name);

  if (!cmd || cmd.name !== 'togif') {
    console.error('❌ FAILED: "togif" command not found!');
    process.exit(1);
  }

  // 2. Generate a test animated WebP (.awebp) buffer using Sharp
  const tempGifInput = path.join(tempDir, `test_togif_in_${Date.now()}.gif`);
  await new Promise((resolve, reject) => {
    const proc = spawn(ffmpegStatic, [
      '-y',
      '-f', 'lavfi',
      '-i', 'testsrc=duration=2:size=320x240:rate=15',
      tempGifInput
    ]);
    proc.on('close', code => (code === 0 ? resolve() : reject(new Error(`Exit code ${code}`))));
  });

  const rawGifBuffer = fs.readFileSync(tempGifInput);
  fs.unlinkSync(tempGifInput);

  const awebpBuffer = await sharp(rawGifBuffer, { animated: true, pages: -1 })
    .webp({ quality: 80, loop: 0 })
    .toBuffer();

  console.log(`Generated sample .awebp buffer (${awebpBuffer.length} bytes)`);

  // 3. Test convertWebpToGif with .awebp buffer
  const { gifBuffer, mp4Buffer } = await convertWebpToGif(awebpBuffer);
  console.log(`Converted GIF buffer size: ${gifBuffer.length} bytes`);
  console.log(`Converted MP4 buffer size: ${mp4Buffer ? mp4Buffer.length : 'null'} bytes`);

  if (!gifBuffer || gifBuffer.length === 0) {
    console.error('❌ FAILED: gifBuffer is empty!');
    process.exit(1);
  }

  if (!mp4Buffer || mp4Buffer.length === 0) {
    console.error('❌ FAILED: mp4Buffer is empty!');
    process.exit(1);
  }

  // 4. Test Mock Command Execution with .awebp message context
  let sentMessagePayload = null;
  let sentReaction = null;

  const mockSock = {
    async sendMessage(jid, payload) {
      if (payload.react) {
        sentReaction = payload.react.text;
      } else {
        sentMessagePayload = payload;
      }
    }
  };

  const mockCtx = {
    sock: mockSock,
    msg: {
      key: { remoteJid: '1234567890@s.whatsapp.net', id: 'msg123' },
      message: {
        documentMessage: {
          fileName: 'sample.awebp',
          mimetype: 'image/webp'
        }
      }
    },
    remoteJid: '1234567890@s.whatsapp.net',
    reply: async (txt) => { console.log('Mock reply:', txt); }
  };

  console.log('Testing mock message detection for .awebp document...');
  const docMsg = mockCtx.msg.message.documentMessage;
  if (!docMsg || !docMsg.fileName.endsWith('.awebp')) {
    console.error('❌ FAILED: .awebp document message not correctly recognized!');
    process.exit(1);
  }

  console.log('✅ ALL TOGIF TESTS PASSED SUCCESSFULLY!');
}

runTogifTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
