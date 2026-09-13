import express from 'express';
import QRCode from 'qrcode';
import config from '../config/config.js';
import logger from '../utils/logger.js';

/**
 * QR Code Web Server Module
 * Provides a lightweight Express web application that binds to Railway's assigned PORT.
 * Generates and serves a real-time web dashboard displaying the WhatsApp login QR code,
 * connection status, and deployment metadata.
 */
class QRServer {
  constructor() {
    this.app = express();
    this.currentQR = null;
    this.status = 'INITIALIZING'; // INITIALIZING, QR_READY, CONNECTING, CONNECTED, DISCONNECTED
    this.userInfo = null;
    this.server = null;
    
    this.setupRoutes();
  }

  /**
   * Defines web routes for status check, QR image API, and main Web UI dashboard.
   */
  setupRoutes() {
    // Serve status as JSON
    this.app.get('/status', (req, res) => {
      res.json({
        status: this.status,
        hasQR: !!this.currentQR,
        botName: config.botName,
        userInfo: this.userInfo,
        timestamp: new Date().toISOString()
      });
    });

    // Serve QR code as Data URL / JSON image
    this.app.get('/qr', async (req, res) => {
      if (!this.currentQR) {
        return res.status(404).json({ error: 'QR Code not available yet or bot already connected.' });
      }

      try {
        const qrImageDataUrl = await QRCode.toDataURL(this.currentQR, {
          margin: 2,
          width: 350,
          color: {
            dark: '#1e293b',
            light: '#ffffff'
          }
        });
        res.json({ qrImageDataUrl });
      } catch (err) {
        logger.error({ err }, 'Failed to render QR Code image');
        res.status(500).json({ error: 'Failed to generate QR code' });
      }
    });

    // Main Web Dashboard HTML page
    this.app.get('/', (req, res) => {
      res.send(this.renderDashboardHtml());
    });
  }

  /**
   * Updates the current QR string received from Baileys.
   * @param {string} qrString - Raw QR code string from Baileys connection update
   */
  setQR(qrString) {
    this.currentQR = qrString;
    this.status = 'QR_READY';
    logger.info('New QR Code updated on Web Server');
  }

  /**
   * Updates the connection status state.
   * @param {string} newStatus - New status string
   * @param {object} [user] - User details if connected
   */
  setStatus(newStatus, user = null) {
    this.status = newStatus;
    if (user) this.userInfo = user;
    if (newStatus === 'CONNECTED') {
      this.currentQR = null;
    }
    logger.info({ newStatus }, 'QR Web Server status updated');
  }

  /**
   * Renders the interactive dark mode Web UI HTML page.
   * Features real-time polling to display live QR updates without page reloads.
   */
  renderDashboardHtml() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${config.botName} - Railway Control Panel</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: rgba(17, 24, 39, 0.75);
      --accent: #25d366;
      --accent-glow: rgba(37, 211, 102, 0.25);
      --text: #f3f4f6;
      --text-muted: #9ca3af;
      --border: rgba(255, 255, 255, 0.08);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', sans-serif; }
    body {
      background: radial-gradient(circle at 50% 0%, #1e293b 0%, var(--bg) 70%);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      width: 100%;
      max-width: 480px;
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      border: 1px solid var(--border);
      border-radius: 24px;
      padding: 32px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.5);
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    .header {
      margin-bottom: 24px;
    }
    .logo {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.5px;
      color: #ffffff;
      margin-bottom: 8px;
    }
    .logo-icon {
      width: 36px;
      height: 36px;
      background: var(--accent);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #000;
      font-weight: bold;
      box-shadow: 0 0 20px var(--accent-glow);
    }
    .subtitle {
      color: var(--text-muted);
      font-size: 14px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 24px;
    }
    .badge.QR_READY { background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); }
    .badge.CONNECTED { background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); }
    .badge.CONNECTING { background: rgba(234, 179, 8, 0.15); color: #facc15; border: 1px solid rgba(234, 179, 8, 0.3); }
    .badge.INITIALIZING { background: rgba(107, 114, 128, 0.15); color: #9ca3af; border: 1px solid rgba(107, 114, 128, 0.3); }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
      box-shadow: 0 0 8px currentColor;
    }
    .qr-box {
      background: #ffffff;
      padding: 16px;
      border-radius: 16px;
      display: inline-block;
      margin: 0 auto 20px auto;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
      min-width: 280px;
      min-height: 280px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .qr-box img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
    }
    .instructions {
      font-size: 13px;
      color: var(--text-muted);
      line-height: 1.6;
      background: rgba(255,255,255,0.03);
      padding: 14px;
      border-radius: 12px;
      border: 1px solid var(--border);
    }
    .footer {
      margin-top: 24px;
      font-size: 12px;
      color: #6b7280;
    }
    .pulse {
      animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">
        <div class="logo-icon">WA</div>
        <span>${config.botName}</span>
      </div>
      <p class="subtitle">Railway Live QR & Status Dashboard</p>
    </div>

    <div id="status-badge" class="badge INITIALIZING">
      <span class="dot"></span>
      <span id="status-text">INITIALIZING</span>
    </div>

    <div id="qr-container">
      <div class="qr-box">
        <p style="color: #64748b; font-size: 14px;" class="pulse">Loading QR Code...</p>
      </div>
    </div>

    <div class="instructions" id="instructions-text">
      Open WhatsApp on your phone → Linked Devices → Link a Device, then scan the QR code above.
    </div>

    <div class="footer">
      Hosted on Railway • Port ${config.port}
    </div>
  </div>

  <script>
    async function checkStatus() {
      try {
        const res = await fetch('/status');
        const data = await res.json();
        
        const badgeEl = document.getElementById('status-badge');
        const statusText = document.getElementById('status-text');
        const qrContainer = document.getElementById('qr-container');
        const instructionsText = document.getElementById('instructions-text');

        badgeEl.className = 'badge ' + data.status;
        statusText.innerText = data.status.replace('_', ' ');

        if (data.status === 'CONNECTED') {
          qrContainer.innerHTML = \`
            <div style="padding: 30px; color: #4ade80;">
              <svg style="width:64px;height:64px;margin-bottom:12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
              <h3 style="color:#ffffff;margin-bottom:6px;">Successfully Connected!</h3>
              <p style="color:#9ca3af;font-size:13px;">User: \${data.userInfo?.id || 'Active Session'}</p>
            </div>
          \`;
          instructionsText.innerText = 'Bot is live and ready to receive messages on WhatsApp!';
        } else if (data.hasQR) {
          const qrRes = await fetch('/qr');
          const qrData = await qrRes.json();
          if (qrData.qrImageDataUrl) {
            qrContainer.innerHTML = \`<div class="qr-box"><img src="\${qrData.qrImageDataUrl}" alt="WhatsApp QR Code" /></div>\`;
            instructionsText.innerText = 'Scan this QR code with WhatsApp on your smartphone to log in.';
          }
        }
      } catch (err) {
        console.error('Error fetching status:', err);
      }
    }

    setInterval(checkStatus, 3000);
    checkStatus();
  </script>
</body>
</html>`;
  }

  /**
   * Starts the Express web server listening on Railway PORT.
   */
  start() {
    return new Promise((resolve) => {
      this.server = this.app.listen(config.port, () => {
        logger.info(`Web QR Server running on port ${config.port} (Railway compatible)`);
        resolve(this.server);
      });
    });
  }
}

export const qrServer = new QRServer();
export default qrServer;
