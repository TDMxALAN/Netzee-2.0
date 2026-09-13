import { downloadFacebookVideo } from '../src/utils/facebookDownloader.js';

async function testFB() {
  console.log('--- Testing Facebook Video Link Downloader Utility ---');
  const testUrl = 'https://www.facebook.com/share/r/18BME5nC9E/?mibextid=wwXIfr';
  
  try {
    console.log(`Input URL: ${testUrl}`);
    const res = await downloadFacebookVideo(testUrl);
    console.log('Download Result:', res);
  } catch (err) {
    console.log('Expected / Handled Error during offline test:', err.message);
  }
}

testFB();
