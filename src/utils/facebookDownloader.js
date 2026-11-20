import axios from 'axios';
import * as cheerio from 'cheerio';
import { getFbVideoInfo } from 'fb-downloader-scrapper';
import logger from './logger.js';

/**
 * Downloads video buffer from a direct media URL.
 * @param {string} url - Direct video CDN URL
 * @returns {Promise<Buffer>}
 */
async function fetchVideoBuffer(url) {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Referer': 'https://www.facebook.com/'
    },
    timeout: 120000,
    maxContentLength: 100 * 1024 * 1024 // 100MB limit
  });

  const buffer = Buffer.from(response.data);
  if (!buffer || buffer.length < 1000) {
    throw new Error('Downloaded video buffer is empty or invalid.');
  }
  return buffer;
}

/**
 * Method 1: Direct page scraping to extract HD/SD playable URLs
 * @param {string} url - Public Facebook video URL
 * @returns {Promise<{downloadUrl: string, quality: string, title: string}>}
 */
async function scrapeDirectFb(url) {
  const pageResponse = await axios.get(url, {
    maxRedirects: 10,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none'
    },
    timeout: 15000
  });

  const rawHtml = pageResponse.data || '';
  if (typeof rawHtml !== 'string') {
    throw new Error('Invalid HTML returned from Facebook');
  }

  // Unescape JSON unicode and backslashes commonly used in Facebook embedded script objects
  const cleanHtml = rawHtml
    .replace(/\\\//g, '/')
    .replace(/\\u0026/g, '&')
    .replace(/\\"/g, '"');

  // Search for HD stream
  const hdMatch = cleanHtml.match(/"browser_native_hd_url":"([^"]+)"/) ||
                  cleanHtml.match(/"playable_url_quality_hd":"([^"]+)"/) ||
                  cleanHtml.match(/hd_src:"([^"]+)"/);

  // Search for SD stream
  const sdMatch = cleanHtml.match(/"browser_native_sd_url":"([^"]+)"/) ||
                  cleanHtml.match(/"playable_url":"([^"]+)"/) ||
                  cleanHtml.match(/sd_src:"([^"]+)"/);

  const titleMatch = cleanHtml.match(/<meta\sproperty="og:title"\scontent="([^"]*)"/) ||
                     cleanHtml.match(/<title>([^<]*)<\/title>/);

  let title = 'Facebook Video';
  if (titleMatch && titleMatch[1]) {
    try {
      title = cheerio.load(`<textarea>${titleMatch[1]}</textarea>`)('textarea').text()
        .replace(/ - Facebook$/, '')
        .trim();
    } catch {
      title = titleMatch[1].replace(/ - Facebook$/, '').trim();
    }
  }

  if (hdMatch && hdMatch[1]) {
    return {
      downloadUrl: hdMatch[1],
      quality: 'HD',
      title
    };
  }

  if (sdMatch && sdMatch[1]) {
    return {
      downloadUrl: sdMatch[1],
      quality: 'SD',
      title
    };
  }

  throw new Error('No playable video sources found in Facebook page HTML.');
}

/**
 * Method 2: Extraction via fb-downloader-scrapper package
 * @param {string} url - Public Facebook video URL
 * @returns {Promise<{downloadUrl: string, quality: string, title: string}>}
 */
async function scrapeViaPackage(url) {
  const fbInfo = await getFbVideoInfo(url);
  if (fbInfo && (fbInfo.hd || fbInfo.sd)) {
    return {
      downloadUrl: fbInfo.hd || fbInfo.sd,
      quality: fbInfo.hd ? 'HD' : 'SD',
      title: fbInfo.title || 'Facebook Video'
    };
  }
  throw new Error('fb-downloader-scrapper returned no valid download URL');
}

/**
 * Master Facebook Downloader Function
 * Uses multi-engine extraction and downloads full media buffer to guarantee delivery.
 * @param {string} url - Facebook video URL
 * @returns {Promise<{success: boolean, buffer: Buffer, downloadUrl: string, quality: string, title: string}>}
 */
export async function downloadFacebookVideo(url) {
  if (!url) {
    throw new Error('Please provide a valid Facebook video link.');
  }

  // Validate URL format
  const fbRegex = /(https?:\/\/)?(www\.|web\.|m\.|fb\.)?(facebook\.com|fb\.watch)\/.+/i;
  if (!fbRegex.test(url.trim())) {
    throw new Error('Invalid Facebook URL provided.');
  }

  const cleanUrl = url.trim();
  const engines = [
    { name: 'Direct FB Scraper', fn: scrapeDirectFb },
    { name: 'fb-downloader-scrapper', fn: scrapeViaPackage }
  ];

  const errors = [];

  for (const engine of engines) {
    try {
      logger.info({ url: cleanUrl, engine: engine.name }, `Attempting FB extraction via ${engine.name}`);
      const info = await engine.fn(cleanUrl);

      if (info && info.downloadUrl) {
        logger.info({ url: cleanUrl, quality: info.quality }, `Fetching video buffer from FB download URL...`);
        const buffer = await fetchVideoBuffer(info.downloadUrl);

        logger.info({ url: cleanUrl, bytes: buffer.length, quality: info.quality }, `Facebook video download complete`);
        return {
          success: true,
          buffer,
          downloadUrl: info.downloadUrl,
          quality: info.quality,
          title: info.title
        };
      }
    } catch (err) {
      logger.warn({ url: cleanUrl, engine: engine.name, error: err.message }, `FB engine ${engine.name} failed`);
      errors.push(`${engine.name}: ${err.message}`);
    }
  }

  throw new Error(`Unable to download Facebook video. Video might be private, deleted, or protected. Details: ${errors.join(' | ')}`);
}

export default downloadFacebookVideo;
