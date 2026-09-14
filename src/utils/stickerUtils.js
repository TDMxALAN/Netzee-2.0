import sharp from 'sharp';
import webp from 'node-webpmux';
import logger from './logger.js';

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

    if (!isAnimated) {
      // Convert static image to 512x512 WebP using sharp
      webpBuffer = await sharp(mediaBuffer)
        .resize(512, 512, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .webp({ quality: 80 })
        .toBuffer();
    } else {
      // Convert animated GIF/video to animated 512x512 WebP using sharp
      // sharp natively handles animated GIF/WebP with animated: true
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
    }

    // Add WhatsApp EXIF Sticker Metadata (sticker-pack-id, sticker-pack-name, sticker-pack-publisher)
    const img = new webp.Image();
    await img.load(webpBuffer);

    const json = {
      'sticker-pack-id': 'com.netzee.bot',
      'sticker-pack-name': packName || 'Netzee Bot',
      'sticker-pack-publisher': authorName || ''
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
