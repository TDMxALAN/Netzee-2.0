import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { spawn } from 'child_process';
import ffmpegStatic from 'ffmpeg-static';
import sharp from 'sharp';
import webp from 'node-webpmux';
import logger from './logger.js';

// Resolve ffmpeg binary path: system path or bundled ffmpeg-static
const ffmpegPath = process.env.FFMPEG_PATH || ffmpegStatic || 'ffmpeg';

/**
 * Converts a video or GIF buffer into a 512x512 animated WebP sticker buffer using FFmpeg.
 * @param {Buffer} mediaBuffer - Input video or gif buffer
 * @param {number} [quality=50] - WebP quality (1-100)
 * @param {number} [fps=15] - Target frames per second
 * @returns {Promise<Buffer>} WebP buffer
 */
async function convertVideoToAnimatedWebp(mediaBuffer, quality = 50, fps = 15) {
  const tempId = crypto.randomBytes(8).toString('hex');
  const tempDir = os.tmpdir();
  const inputPath = path.join(tempDir, `netzee_in_${tempId}.mp4`);
  const outputPath = path.join(tempDir, `netzee_out_${tempId}.webp`);

  try {
    await fs.promises.writeFile(inputPath, mediaBuffer);

    await new Promise((resolve, reject) => {
      // Scale to 512x512 preserving aspect ratio, pad transparently, cap duration at 7s
      const args = [
        '-y',
        '-i', inputPath,
        '-t', '00:00:07',
        '-vf', `scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000,fps=${fps}`,
        '-vcodec', 'libwebp',
        '-lossless', '0',
        '-compression_level', '4',
        '-q:v', `${quality}`,
        '-loop', '0',
        '-preset', 'default',
        '-an',
        outputPath
      ];

      const proc = spawn(ffmpegPath, args);
      let stderr = '';

      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          logger.error({ stderr, code }, 'FFmpeg conversion failed');
          reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-300)}`));
        }
      });

      proc.on('error', (err) => {
        reject(err);
      });
    });

    let webpBuffer = await fs.promises.readFile(outputPath);

    // WhatsApp animated stickers must be under 1MB (1,048,576 bytes)
    if (webpBuffer.length > 1000000 && quality > 30) {
      logger.info(`Animated sticker size ${webpBuffer.length} exceeds 1MB, compressing with lower quality...`);
      return await convertVideoToAnimatedWebp(mediaBuffer, 30, 10);
    }

    return webpBuffer;
  } finally {
    try {
      if (fs.existsSync(inputPath)) await fs.promises.unlink(inputPath);
    } catch (_) {}
    try {
      if (fs.existsSync(outputPath)) await fs.promises.unlink(outputPath);
    } catch (_) {}
  }
}

/**
 * Converts image or video/gif buffer into a WhatsApp WebP sticker with metadata.
 * @param {Buffer} mediaBuffer - Raw buffer of image, gif, or mp4 video
 * @param {boolean} isAnimated - True if converting video/gif, false for static image
 * @param {string} [packName='Netzee Bot'] - Pack Name metadata
 * @param {string} [authorName=''] - Author / Caption metadata
 * @returns {Promise<Buffer>} WebP sticker buffer ready for WhatsApp
 */
export async function createSticker(mediaBuffer, isAnimated = false, packName = 'Netzee Bot', authorName = '') {
  try {
    let webpBuffer;

    // Check if buffer is an MP4 video (common for WhatsApp GIFs)
    const isMp4 = mediaBuffer.length > 8 && mediaBuffer.slice(4, 8).toString() === 'ftyp';

    if (isAnimated || isMp4) {
      if (isMp4) {
        // MP4 videos must be decoded and converted via FFmpeg
        webpBuffer = await convertVideoToAnimatedWebp(mediaBuffer);
      } else {
        // Try Sharp first for native animated GIF/WebP
        try {
          webpBuffer = await sharp(mediaBuffer, { animated: true, pages: -1 })
            .resize(512, 512, {
              fit: 'contain',
              background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .webp({
              quality: 60,
              effort: 4,
              loop: 0
            })
            .toBuffer();
        } catch (sharpErr) {
          logger.warn({ err: sharpErr.message }, 'Sharp failed for animated media, falling back to FFmpeg');
          webpBuffer = await convertVideoToAnimatedWebp(mediaBuffer);
        }
      }
    } else {
      // Convert static image to 512x512 WebP using sharp
      try {
        webpBuffer = await sharp(mediaBuffer)
          .resize(512, 512, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          })
          .webp({ quality: 80 })
          .toBuffer();
      } catch (sharpErr) {
        logger.warn({ err: sharpErr.message }, 'Sharp failed for image media, falling back to FFmpeg');
        webpBuffer = await convertVideoToAnimatedWebp(mediaBuffer);
      }
    }

    // Add WhatsApp EXIF Sticker Metadata (sticker-pack-id, sticker-pack-name, sticker-pack-publisher)
    const img = new webp.Image();
    await img.load(webpBuffer);

    const json = {
      'sticker-pack-id': 'com.netzee.bot',
      'sticker-pack-name': packName ?? 'Netzee Bot',
      'sticker-pack-publisher': authorName ?? ''
    };

    const exifHeader = Buffer.from([
      0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00,
      0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x16, 0x00, 0x00, 0x00
    ]);

    const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf-8');
    const exif = Buffer.concat([exifHeader, jsonBuffer]);
    exif.writeUInt32LE(jsonBuffer.length, 14);

    img.exif = exif;
    const finalBuffer = await img.save(null);
    return finalBuffer;
  } catch (err) {
    logger.error({ err }, 'Error building WebP sticker');
    throw err;
  }
}

/**
 * Converts WebP / animated WebP (.awebp) / sticker media buffer into GIF and MP4 buffers.
 * @param {Buffer} mediaBuffer - Input WebP, animated WebP, sticker, GIF, or video buffer
 * @returns {Promise<{ gifBuffer: Buffer, mp4Buffer: Buffer | null }>}
 */
export async function convertWebpToGif(mediaBuffer) {
  const tempId = crypto.randomBytes(8).toString('hex');
  const tempDir = os.tmpdir();
  let gifBuffer = null;

  // 1. Convert input buffer to GIF using Sharp (or FFmpeg fallback)
  try {
    gifBuffer = await sharp(mediaBuffer, { animated: true, pages: -1 })
      .gif({ loop: 0 })
      .toBuffer();
  } catch (sharpErr) {
    logger.warn({ err: sharpErr.message }, 'Sharp GIF conversion failed, attempting FFmpeg fallback');

    const inputPath = path.join(tempDir, `netzee_gif_in_${tempId}.bin`);
    const gifOutputPath = path.join(tempDir, `netzee_gif_out_${tempId}.gif`);

    try {
      await fs.promises.writeFile(inputPath, mediaBuffer);
      await new Promise((resolve, reject) => {
        const args = [
          '-y',
          '-i', inputPath,
          '-vf', 'fps=15,scale=512:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
          gifOutputPath
        ];
        const proc = spawn(ffmpegPath, args);
        let stderr = '';
        proc.stderr.on('data', chunk => { stderr += chunk.toString(); });
        proc.on('close', code => {
          if (code === 0) resolve();
          else reject(new Error(`FFmpeg GIF exit code ${code}: ${stderr.slice(-300)}`));
        });
        proc.on('error', reject);
      });
      gifBuffer = await fs.promises.readFile(gifOutputPath);
    } finally {
      try { if (fs.existsSync(inputPath)) await fs.promises.unlink(inputPath); } catch (_) {}
      try { if (fs.existsSync(gifOutputPath)) await fs.promises.unlink(gifOutputPath); } catch (_) {}
    }
  }

  if (!gifBuffer) {
    throw new Error('Failed to convert WebP to GIF');
  }

  // 2. Convert GIF to MP4 video buffer for WhatsApp native gifPlayback
  let mp4Buffer = null;
  const tempGifFile = path.join(tempDir, `netzee_mp4_in_${tempId}.gif`);
  const tempMp4File = path.join(tempDir, `netzee_mp4_out_${tempId}.mp4`);

  try {
    await fs.promises.writeFile(tempGifFile, gifBuffer);
    await new Promise((resolve, reject) => {
      const args = [
        '-y',
        '-i', tempGifFile,
        '-movflags', 'faststart',
        '-pix_fmt', 'yuv420p',
        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
        tempMp4File
      ];
      const proc = spawn(ffmpegPath, args);
      let stderr = '';
      proc.stderr.on('data', chunk => { stderr += chunk.toString(); });
      proc.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg MP4 exit code ${code}: ${stderr.slice(-300)}`));
      });
      proc.on('error', reject);
    });

    mp4Buffer = await fs.promises.readFile(tempMp4File);
  } catch (mp4Err) {
    logger.warn({ err: mp4Err.message }, 'Failed to generate MP4 for gifPlayback, falling back to GIF file only');
  } finally {
    try { if (fs.existsSync(tempGifFile)) await fs.promises.unlink(tempGifFile); } catch (_) {}
    try { if (fs.existsSync(tempMp4File)) await fs.promises.unlink(tempMp4File); } catch (_) {}
  }

  return { gifBuffer, mp4Buffer };
}

