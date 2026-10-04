import axios from 'axios';
import * as cheerio from 'cheerio';
import logger from './logger.js';

/**
 * Validates whether the given string is a TikTok URL.
 * Supports standard tiktok.com, vm.tiktok.com, vt.tiktok.com, m.tiktok.com links.
 * @param {string} url 
 * @returns {boolean}
 */
export function isTikTokUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const tiktokRegex = /(https?:\/\/)?(www\.|vm\.|vt\.|m\.|t\.)?(tiktok\.com)\/.+/i;
  return tiktokRegex.test(url.trim());
}

/**
 * Method 1: TikWM API (HD / No-watermark primary)
 */
async function downloadViaTikWM(url) {
  const res = await axios.post('https://www.tikwm.com/api/', new URLSearchParams({ url, hd: '1' }), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/javascript, */*; q=0.01'
    },
    timeout: 12000
  });

  if (res.data && res.data.code === 0 && res.data.data) {
    const data = res.data.data;
    const downloadUrl = data.hdplay || data.play || data.wmplay;
    if (downloadUrl) {
      const fullUrl = downloadUrl.startsWith('http') ? downloadUrl : `https://www.tikwm.com${downloadUrl}`;
      return {
        source: 'TikWM',
        downloadUrl: fullUrl,
        title: data.title || 'TikTok Video',
        author: data.author?.nickname || data.author?.unique_id || 'Unknown',
        quality: data.hdplay ? 'HD (No Watermark)' : 'Original (No Watermark)'
      };
    }
  }
  throw new Error('TikWM returned no valid video URL');
}

/**
 * Method 2: SSSTik.io Scraper
 */
async function downloadViaSSSTik(url) {
  const page = await axios.get('https://ssstik.io/en', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    timeout: 12000
  });

  const $ = cheerio.load(page.data);
  const formAction = $('form[hx-post]').attr('hx-post') || '/abc?url=dl';
  const ttToken = $('input[name="tt"]').val() || '';

  const params = new URLSearchParams();
  params.append('id', url);
  params.append('locale', 'en');
  params.append('tt', ttToken);

  const res = await axios.post(`https://ssstik.io${formAction}`, params, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'HX-Request': 'true',
      'HX-Target': 'target',
      'HX-Current-URL': 'https://ssstik.io/en'
    },
    timeout: 12000
  });

  const $res = cheerio.load(res.data);
  const downloadUrl = $res('a.without_watermark').attr('href') || $res('a.download_link').attr('href');
  const title = $res('p.maintext').text().trim() || 'TikTok Video';

  if (downloadUrl) {
    return {
      source: 'SSSTik',
      downloadUrl,
      title,
      author: 'TikTok User',
      quality: 'Original (No Watermark)'
    };
  }

  throw new Error('SSSTik returned no valid video URL');
}

/**
 * Method 3: SaveTik API
 */
async function downloadViaSaveTik(url) {
  const params = new URLSearchParams();
  params.append('q', url);
  params.append('vt', 'home');

  const res = await axios.post('https://savetik.co/api/ajaxSearch', params, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
    },
    timeout: 12000
  });

  if (res.data && res.data.data) {
    const $ = cheerio.load(res.data.data);
    const downloadUrl = $('a.tik-button-dl').first().attr('href') || $('a[href*="download"]').first().attr('href');
    const title = $('h3').text().trim() || 'TikTok Video';

    if (downloadUrl) {
      return {
        source: 'SaveTik',
        downloadUrl,
        title,
        author: 'TikTok User',
        quality: 'Maximum Available'
      };
    }
  }

  throw new Error('SaveTik returned no valid video URL');
}

/**
 * Method 4: TikMate API
 */
async function downloadViaTikMate(url) {
  const params = new URLSearchParams();
  params.append('url', url);

  const res = await axios.post('https://api.tikmate.app/api/lookup', params, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
    },
    timeout: 12000
  });

  if (res.data && res.data.token && res.data.id) {
    const downloadUrl = `https://tikmate.app/download/${res.data.token}/${res.data.id}.mp4`;
    return {
      source: 'TikMate',
      downloadUrl,
      title: res.data.author_name ? `TikTok by ${res.data.author_name}` : 'TikTok Video',
      author: res.data.author_name || 'TikTok User',
      quality: 'High Quality (No Watermark)'
    };
  }

  throw new Error('TikMate returned no valid token or video ID');
}

/**
 * Method 5: TikWM Backup GET Endpoint
 */
async function downloadViaTikWMBackup(url) {
  const res = await axios.get(`https://tikwm.com/api/?url=${encodeURIComponent(url)}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    timeout: 12000
  });

  if (res.data && res.data.data) {
    const data = res.data.data;
    const downloadUrl = data.play || data.wmplay;
    if (downloadUrl) {
      const fullUrl = downloadUrl.startsWith('http') ? downloadUrl : `https://tikwm.com${downloadUrl}`;
      return {
        source: 'TikWM Backup',
        downloadUrl: fullUrl,
        title: data.title || 'TikTok Video',
        author: data.author?.nickname || data.author?.unique_id || 'Unknown',
        quality: 'Standard (No Watermark)'
      };
    }
  }

  throw new Error('TikWM Backup returned no valid video URL');
}

/**
 * Master TikTok Downloader Function
 * Tries 5 different extraction methods sequentially to guarantee video delivery.
 * @param {string} url - TikTok video URL
 * @returns {Promise<{downloadUrl: string, title: string, author: string, quality: string, source: string}>}
 */
export async function downloadTikTokVideo(url) {
  if (!isTikTokUrl(url)) {
    throw new Error('Invalid TikTok video link provided.');
  }

  const cleanUrl = url.trim();
  const methods = [
    { name: 'TikWM HD', fn: downloadViaTikWM },
    { name: 'SSSTik', fn: downloadViaSSSTik },
    { name: 'SaveTik', fn: downloadViaSaveTik },
    { name: 'TikMate', fn: downloadViaTikMate },
    { name: 'TikWM Backup', fn: downloadViaTikWMBackup }
  ];

  const errors = [];

  for (const method of methods) {
    try {
      logger.info({ url: cleanUrl, method: method.name }, `Attempting TikTok download via ${method.name}`);
      const result = await method.fn(cleanUrl);
      if (result && result.downloadUrl) {
        logger.info({ url: cleanUrl, source: result.source, quality: result.quality }, `TikTok download succeeded via ${result.source}`);
        return result;
      }
    } catch (err) {
      logger.warn({ url: cleanUrl, method: method.name, error: err.message }, `TikTok download method ${method.name} failed`);
      errors.push(`${method.name}: ${err.message}`);
    }
  }

  throw new Error(`Failed to download TikTok video after trying 5 download engines. Details: ${errors.join(' | ')}`);
}

export default downloadTikTokVideo;
