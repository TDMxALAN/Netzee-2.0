import axios from 'axios';
import * as cheerio from 'cheerio';

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

  // Common user-agents for requests
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

  // Strategy 1: Query API service via snapSave / fdown scraper
  try {
    const formData = new URLSearchParams();
    formData.append('url', url);

    const apiRes = await axios.post('https://snapsave.app/action.php', formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': userAgent,
        'Origin': 'https://snapsave.app',
        'Referer': 'https://snapsave.app/'
      },
      timeout: 10000
    });

    if (apiRes.data && typeof apiRes.data === 'string') {
      const match = apiRes.data.match(/href=\\?"(https:\/\/[^"]+)"/g);
      if (match && match.length > 0) {
        const cleanUrl = match[0].replace(/href=\\?"/, '').replace(/"$/, '').replace(/\\/g, '');
        return {
          success: true,
          downloadUrl: cleanUrl,
          quality: 'HD/SD',
          title: 'Facebook Video'
        };
      }
    }
  } catch (err) {
    // Continue to next strategy if SnapSave fails
  }

  // Strategy 2: Direct FDown fetch with customized headers
  try {
    const formData = new URLSearchParams();
    formData.append('URLz', url);

    const fdownRes = await axios.post('https://fdown.net/download.php', formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': 'https://fdown.net/'
      },
      timeout: 10000
    });

    const $ = cheerio.load(fdownRes.data);
    const hdLink = $('#hdlink').attr('href');
    const sdLink = $('#sdlink').attr('href');
    const downloadUrl = hdLink || sdLink;

    if (downloadUrl) {
      return {
        success: true,
        downloadUrl,
        quality: hdLink ? 'HD' : 'SD',
        title: $('div.lib-row.lib-header').text().trim() || 'Facebook Video'
      };
    }
  } catch (err) {
    // Continue to fallback
  }

  // Strategy 3: Mobile page regex extraction fallback
  try {
    const mobileUrl = url.replace('www.facebook.com', 'm.facebook.com');
    const pageResponse = await axios.get(mobileUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
      },
      timeout: 10000
    });

    const html = pageResponse.data;
    const hdMatch = html.match(/"browser_native_hd_url":"([^"]+)"/) || html.match(/hd_src:"([^"]+)"/);
    const sdMatch = html.match(/"browser_native_sd_url":"([^"]+)"/) || html.match(/sd_src:"([^"]+)"/);

    const fallbackHd = hdMatch ? hdMatch[1].replace(/\\/g, '') : null;
    const fallbackSd = sdMatch ? sdMatch[1].replace(/\\/g, '') : null;
    const fallbackUrl = fallbackHd || fallbackSd;

    if (fallbackUrl) {
      return {
        success: true,
        downloadUrl: fallbackUrl,
        quality: fallbackHd ? 'HD' : 'SD',
        title: 'Facebook Video'
      };
    }
  } catch (err) {
    // Fallback failure
  }

  throw new Error('Unable to extract video. Video might be private or protected.');
}

export default downloadFacebookVideo;
