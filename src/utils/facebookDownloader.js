import { getFbVideoInfo } from 'fb-downloader-scrapper';

/**
 * Utility to extract Facebook video download URLs (HD/SD) from various Facebook links
 * Supports reel links (/share/r/...), watch links, fb.watch, etc.
 */
export async function downloadFacebookVideo(url) {
  if (!url) {
    throw new Error('Please provide a valid Facebook video link.');
  }

  // Sanitize and validate URL format
  const fbRegex = /(https?:\/\/)?(www\.|web\.|m\.|fb\.)?(facebook\.com|fb\.watch)\/.+/i;
  if (!fbRegex.test(url)) {
    throw new Error('Invalid Facebook URL provided.');
  }

  try {
    const fbInfo = await getFbVideoInfo(url);
    if (fbInfo && (fbInfo.hd || fbInfo.sd)) {
      const downloadUrl = fbInfo.hd || fbInfo.sd;
      return {
        success: true,
        downloadUrl,
        quality: fbInfo.hd ? 'HD' : 'SD',
        title: fbInfo.title || 'Facebook Video'
      };
    }
  } catch (err) {
    // If extraction fails, log it or just fall through to throw error below
    // console.error("FB extraction error:", err.message);
  }

  throw new Error('Unable to extract video. Video might be private or protected.');
}

export default downloadFacebookVideo;
