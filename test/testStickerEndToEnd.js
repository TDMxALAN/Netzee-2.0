import { createSticker } from '../src/utils/stickerUtils.js';
import ffmpeg from 'ffmpeg-static';
import { execFileSync } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs';
import webp from 'node-webpmux';

async function runTests() {
  console.log('--- Testing Sticker End-to-End ---');

  // 1. Generate test MP4 video buffer
  const tempMp4 = path.join(os.tmpdir(), `test_sticker_${Date.now()}.mp4`);
  execFileSync(ffmpeg, [
    '-y',
    '-f', 'lavfi',
    '-i', 'testsrc=duration=2:size=320x240:rate=15',
    '-pix_fmt', 'yuv420p',
    tempMp4
  ]);
  const videoBuffer = fs.readFileSync(tempMp4);
  fs.unlinkSync(tempMp4);
  console.log(`Generated sample MP4 buffer (${videoBuffer.length} bytes)`);

  // 2. Test createSticker with video (Animated Sticker without name)
  console.log('Testing createSticker with MP4 video buffer (no name)...');
  const animStickerNoName = await createSticker(videoBuffer, true, '', '');
  console.log(`Animated sticker (no name) size: ${animStickerNoName.length} bytes`);

  const img1 = new webp.Image();
  await img1.load(animStickerNoName);
  console.log(`Sticker metadata: width=${img1.width}, height=${img1.height}, hasAnim=${img1.hasAnim}`);
  if (!img1.hasAnim) throw new Error('Expected animated sticker to have hasAnim=true');

  // 3. Test createSticker with video (Animated Sticker with caption "netzee")
  console.log('Testing createSticker with caption "netzee"...');
  const animStickerWithCaption = await createSticker(videoBuffer, true, 'netzee', 'netzee');
  const img2 = new webp.Image();
  await img2.load(animStickerWithCaption);
  console.log(`Sticker with caption: width=${img2.width}, height=${img2.height}, hasAnim=${img2.hasAnim}`);

  console.log('✅ ALL STICKER TESTS PASSED SUCCESSFULLY!');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
