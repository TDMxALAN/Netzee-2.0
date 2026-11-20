import { downloadTikTokVideo } from '../src/utils/tiktokDownloader.js';

async function testTT() {
  console.log('--- Testing TikTok Video Downloader Utility ---');
  const testUrl = 'https://www.tiktok.com/@tiktok/video/7106594312292453675';

  try {
    console.log(`Input URL: ${testUrl}`);
    const res = await downloadTikTokVideo(testUrl);
    console.log('TikTok Download Result:', {
      source: res.source,
      quality: res.quality,
      title: res.title,
      author: res.author,
      downloadUrl: res.downloadUrl?.slice(0, 80) + '...',
      bufferBytes: res.buffer?.length
    });
  } catch (err) {
    console.error('Error during TikTok test:', err.message);
  }
}

testTT();
