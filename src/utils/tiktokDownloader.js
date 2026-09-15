import axios from 'axios';
import logger from './logger.js';

/**
 * Utility to extract TikTok video download URLs (HD No-Watermark) from TikTok links.
 * Supports short links (vt.tiktok.com, vm.tiktok.com) and full video links (tiktok.com/@user/video/...).
 * 
 * @param {string} url - TikTok video URL
 * @returns {Promise<object>} Object containing downloadUrl, quality, title, author
 */
export async function downloadTikTokVideo(url) {
  if (!url) {
    throw new Error('Please provide a valid TikTok video link.');
  }

  // Sanitize and validate TikTok URL format
  const tiktokRegex = /(https?:\/\/)?(www\.|vt\.|vm\.|v\.)?(tiktok\.com)\/.+/i;
  if (!tiktokRegex.test(url)) {
    throw new Error('Invalid TikTok URL provided. Please provide a valid TikTok video link.');
  }

  // Clean the URL (remove trailing whitespace or non-URL trailing characters)
  const cleanUrl = url.trim();

  // Primary attempt: TikWM API with HD parameter
  try {
    const response = await axios.post(
      'https://www.tikwm.com/api/',
      new URLSearchParams({
        url: cleanUrl,
        hd: '1'
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 15000
      }
    );

    if (response.data && response.data.code === 0 && response.data.data) {
      const data = response.data.data;
      
      // Maximum quality preferred: hdplay, otherwise fallback to play (no watermark)
      const downloadUrl = data.hdplay || data.play;
      const isHd = !!data.hdplay;

      if (downloadUrl) {
        // Build video title / caption
        let title = data.title || '';
        if (!title && Array.isArray(data.content_desc)) {
          title = data.content_desc.join(' ');
        }

        const authorName = data.author?.nickname || data.author?.unique_id || 'TikTok Creator';

        return {
          success: true,
          downloadUrl,
          quality: isHd ? 'HD (No Watermark)' : 'SD (No Watermark)',
          title: title.trim() || 'TikTok Video',
          author: authorName,
          duration: data.duration || 0
        };
      }
    }
  } catch (err) {
    logger.warn({ err: err.message, url: cleanUrl }, 'Primary TikTok extraction failed, trying secondary fallback');
  }

  // Secondary Fallback attempt: TikWM GET request / API fallback
  try {
    const fallbackResponse = await axios.get(`https://www.tikwm.com/api/`, {
      params: { url: cleanUrl, hd: 1 },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      timeout: 15000
    });

    if (fallbackResponse.data && fallbackResponse.data.code === 0 && fallbackResponse.data.data) {
      const data = fallbackResponse.data.data;
      const downloadUrl = data.hdplay || data.play;

      if (downloadUrl) {
        let title = data.title || '';
        if (!title && Array.isArray(data.content_desc)) {
          title = data.content_desc.join(' ');
        }

        const authorName = data.author?.nickname || data.author?.unique_id || 'TikTok Creator';

        return {
          success: true,
          downloadUrl,
          quality: data.hdplay ? 'HD (No Watermark)' : 'SD (No Watermark)',
          title: title.trim() || 'TikTok Video',
          author: authorName,
          duration: data.duration || 0
        };
      }
    }
  } catch (err) {
    logger.error({ err: err.message, url: cleanUrl }, 'Secondary TikTok extraction failed');
  }

  throw new Error('Unable to fetch TikTok video. Make sure the video is public and the link is valid.');
}

export default downloadTikTokVideo;
