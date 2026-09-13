import express from 'express';
import QRCode from 'qrcode';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { normalizePhoneNumber } from '../utils/phoneUtils.js';

/**
 * QR Code & Pairing Code Web Server Module
 * Provides a lightweight Express web application that binds to Railway's assigned PORT.
 * Generates and serves high-contrast QR codes, 8-digit pairing codes, and a Session Reset action.
 */
class QRServer {
  constructor() {
    this.app = express();
    this.currentQR = null;
    this.status = 'INITIALIZING'; // INITIALIZING, QR_READY, CONNECTING, CONNECTED, DISCONNECTED
    this.userInfo = null;
    this.server = null;
    this.pairingHandler = null;
    this.resetHandler = null;
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
  }

  /**
   * Defines web routes for status check, QR image API, pairing code API, reset session API, and main UI.
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

    // Serve QR code as high-contrast Data URL image
    this.app.get('/qr', async (req, res) => {
      if (!this.currentQR) {
        return res.status(404).json({ error: 'QR Code not available yet or bot already connected.' });
      }

      try {
        const qrImageDataUrl = await QRCode.toDataURL(this.currentQR, {
          margin: 4,
          width: 360,
          errorCorrectionLevel: 'M',
          color: {
            dark: '#000000',
            light: '#ffffff'
          }
        });
        res.json({ qrImageDataUrl });
      } catch (err) {
        logger.error({ err }, 'Failed to render QR Code image');
        res.status(500).json({ error: 'Failed to generate QR code' });
      }
    });

    // Handle Pairing Code requests
    this.app.post('/pair', async (req, res) => {
      const rawPhone = req.body.phone;
      if (!rawPhone) {
        return res.status(400).json({ error: 'Phone number is required.' });
      }

      const digits = normalizePhoneNumber(rawPhone);
      if (!digits) {
        return res.status(400).json({ error: 'Invalid phone number format.' });
      }

      if (!this.pairingHandler) {
        return res.status(500).json({ error: 'Pairing code service not initialized.' });
      }

      try {
        const code = await this.pairingHandler(digits);
        res.json({ success: true, code, phone: digits });
      } catch (err) {
        logger.error({ err }, 'Error requesting pairing code');
        res.status(500).json({ error: err.message || 'Failed to request pairing code.' });
      }
    });

    // Reset Session endpoint to clear broken keys and generate fresh QR/Pairing code
    this.app.post('/reset', async (req, res) => {
      if (!this.resetHandler) {
        return res.status(500).json({ error: 'Reset handler not ready.' });
      }

      try {
        this.currentQR = null;
        this.status = 'INITIALIZING';
        await this.resetHandler();
        res.json({ success: true, message: 'Session reset. Generating fresh QR & Pairing Code...' });
      } catch (err) {
        logger.error({ err }, 'Error resetting session');
        res.status(500).json({ error: 'Failed to reset session.' });
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
   * Renders the interactive Web UI HTML dashboard.
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
      --card-bg: rgba(17, 24, 39, 0.88);
      --accent: #25d366;
      --accent-glow: rgba(37, 211, 102, 0.25);
      --text: #f3f4f6;
      --text-muted: #9ca3af;
      --border: rgba(255, 255, 255, 0.1);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', sans-serif; }
    body {
      background: radial-gradient(circle at 50% 0%, #1e293b 0%, var(--bg) 75%);
      color: var(--text);
      min-height: 100vh;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      padding: 20px;
    }
    .container {
      width: 100%; max-width: 500px;
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      border: 1px solid var(--border);
      border-radius: 24px; padding: 32px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.5);
      text-align: center;
    }
    .header { margin-bottom: 20px; }
    .logo {
      display: inline-flex; align-items: center; gap: 10px;
      font-size: 24px; font-weight: 800; color: #ffffff; margin-bottom: 6px;
    }
    .logo-icon {
      width: 38px; height: 38px; background: var(--accent);
      border-radius: 12px; display: flex; align-items: center; justify-content: center;
      color: #000; font-weight: bold; box-shadow: 0 0 20px var(--accent-glow);
    }
    .subtitle { color: var(--text-muted); font-size: 14px; }
    .badge {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 14px; border-radius: 20px;
      font-size: 13px; font-weight: 600; text-transform: uppercase;
      margin-bottom: 20px;
    }
    .badge.QR_READY { background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); }
    .badge.CONNECTED { background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); }
    .badge.CONNECTING { background: rgba(234, 179, 8, 0.15); color: #facc15; border: 1px solid rgba(234, 179, 8, 0.3); }
    .badge.INITIALIZING, .badge.DISCONNECTED { background: rgba(107, 114, 128, 0.15); color: #9ca3af; border: 1px solid rgba(107, 114, 128, 0.3); }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
    
    .tab-buttons {
      display: flex; gap: 8px; background: rgba(0,0,0,0.3); padding: 4px; border-radius: 12px; margin-bottom: 20px;
    }
    .tab-btn {
      flex: 1; padding: 10px; border: none; background: transparent; color: var(--text-muted);
      font-weight: 600; font-size: 13px; border-radius: 8px; cursor: pointer; transition: all 0.2s;
    }
    .tab-btn.active { background: rgba(255,255,255,0.1); color: #ffffff; }

    .tab-content { display: none; }
    .tab-content.active { display: block; }

    .qr-box {
      background: #ffffff; padding: 16px; border-radius: 16px;
      display: inline-block; margin: 0 auto 16px auto;
      box-shadow: 0 10px 30px rgba(0,0,0,0.4);
      min-width: 280px; min-height: 280px;
      display: flex; align-items: center; justify-content: center;
    }
    .qr-box img { max-width: 100%; height: auto; display: block; }
    
    .pairing-box {
      background: rgba(255,255,255,0.04); border: 1px solid var(--border);
      border-radius: 16px; padding: 20px; margin-bottom: 16px;
    }
    .input-group { display: flex; gap: 8px; margin-bottom: 12px; }
    .input-field {
      flex: 1; padding: 12px 14px; border-radius: 10px;
      border: 1px solid var(--border); background: rgba(0,0,0,0.4);
      color: #fff; font-size: 14px; outline: none;
    }
    .submit-btn {
      padding: 12px 20px; background: var(--accent); color: #000;
      font-weight: 700; border: none; border-radius: 10px; cursor: pointer;
    }
    .code-display {
      font-size: 32px; font-weight: 800; letter-spacing: 6px; color: var(--accent);
      background: rgba(37, 211, 102, 0.1); padding: 14px; border-radius: 12px;
      margin-top: 12px; border: 1px dashed var(--accent); display: none;
    }

    .action-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 16px; background: rgba(239, 68, 68, 0.15); color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 10px;
      font-size: 12px; font-weight: 600; cursor: pointer; margin-top: 14px;
    }
    .action-btn:hover { background: rgba(239, 68, 68, 0.25); }

    .instructions {
      font-size: 13px; color: var(--text-muted); line-height: 1.5;
      background: rgba(255,255,255,0.03); padding: 12px; border-radius: 12px; border: 1px solid var(--border);
    }
    .footer { margin-top: 20px; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">
        <div class="logo-icon">WA</div>
        <span>${config.botName}</span>
      </div>
      <p class="subtitle">Railway Control Panel</p>
    </div>

    <div id="status-badge" class="badge INITIALIZING">
      <span class="dot"></span>
      <span id="status-text">INITIALIZING</span>
    </div>

    <div class="tab-buttons" id="tab-controls">
      <button class="tab-btn active" onclick="switchTab(event, 'qr-tab')">Scan QR Code</button>
      <button class="tab-btn" onclick="switchTab(event, 'pair-tab')">8-Digit Pairing Code</button>
    </div>

    <!-- QR TAB -->
    <div id="qr-tab" class="tab-content active">
      <div id="qr-container">
        <div class="qr-box">
          <p style="color: #64748b; font-size: 14px;">Loading QR Code...</p>
        </div>
      </div>
      <div class="instructions">
        Open WhatsApp on phone → <b>Linked Devices</b> → <b>Link a Device</b> and scan the high-contrast QR code.
      </div>
    </div>

    <!-- PAIRING CODE TAB -->
    <div id="pair-tab" class="tab-content">
      <div class="pairing-box">
        <p style="font-size:13px; color:var(--text-muted); margin-bottom:12px;">Enter your phone number with country code (e.g. 94722666467 or 0722666467):</p>
        <div class="input-group">
          <input type="text" id="phone-input" class="input-field" placeholder="94722666467">
          <button onclick="requestPairingCode()" class="submit-btn">Get Code</button>
        </div>
        <div id="code-result" class="code-display"></div>
        <p id="pair-error" style="color:#f87171; font-size:12px; margin-top:8px; display:none;"></p>
      </div>
      <div class="instructions">
        In WhatsApp → <b>Linked Devices</b> → <b>Link with Phone Number</b> and type the 8-digit code shown above.
      </div>
    </div>

    <div id="reset-section">
      <button onclick="resetSession()" class="action-btn">🔄 Reset Session & Generate Fresh QR/Code</button>
    </div>

    <div class="footer">Hosted on Railway • Port ${config.port}</div>
  </div>

  <script>
    function switchTab(evt, tabId) {
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      evt.target.classList.add('active');
      document.getElementById(tabId).classList.add('active');
    }

    async function requestPairingCode() {
      const phone = document.getElementById('phone-input').value;
      const codeResult = document.getElementById('code-result');
      const pairError = document.getElementById('pair-error');
      
      codeResult.style.display = 'none';
      pairError.style.display = 'none';

      if (!phone) {
        pairError.innerText = 'Please enter a phone number.';
        pairError.style.display = 'block';
        return;
      }

      try {
        const res = await fetch('/pair', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone })
        });
        const data = await res.json();
        if (data.success && data.code) {
          codeResult.innerText = data.code;
          codeResult.style.display = 'block';
        } else {
          pairError.innerText = data.error || 'Failed to generate code.';
          pairError.style.display = 'block';
        }
      } catch (err) {
        pairError.innerText = 'Error connecting to server.';
        pairError.style.display = 'block';
      }
    }

    async function resetSession() {
      if (!confirm('This will clear broken session data and regenerate a fresh QR & Pairing Code. Proceed?')) return;
      try {
        const res = await fetch('/reset', { method: 'POST' });
        const data = await res.json();
        alert(data.message || 'Session reset successfully.');
        location.reload();
      } catch (err) {
        alert('Failed to reset session.');
      }
    }

    let lastQR = '';
    async function checkStatus() {
      try {
        const res = await fetch('/status');
        const data = await res.json();
        
        const badgeEl = document.getElementById('status-badge');
        const statusText = document.getElementById('status-text');
        const qrContainer = document.getElementById('qr-container');

        badgeEl.className = 'badge ' + data.status;
        statusText.innerText = data.status.replace('_', ' ');

        if (data.status === 'CONNECTED') {
          document.getElementById('tab-controls').style.display = 'none';
          document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
          document.getElementById('reset-section').style.display = 'none';
          qrContainer.innerHTML = \`
            <div style="padding: 30px; color: #4ade80;">
              <svg style="width:64px;height:64px;margin-bottom:12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
              <h3 style="color:#ffffff;margin-bottom:6px;">Bot Connected & Active!</h3>
              <p style="color:#9ca3af;font-size:13px;">User ID: \${data.userInfo?.id || 'Active Session'}</p>
            </div>
          \`;
          qrContainer.style.display = 'block';
        } else if (data.hasQR) {
          const qrRes = await fetch('/qr?t=' + Date.now());
          const qrData = await qrRes.json();
          if (qrData.qrImageDataUrl && qrData.qrImageDataUrl !== lastQR) {
            lastQR = qrData.qrImageDataUrl;
            qrContainer.innerHTML = \`<div class="qr-box"><img src="\${qrData.qrImageDataUrl}" alt="WhatsApp QR Code" /></div>\`;
          }
        }
      } catch (err) {
        console.error('Error checking status:', err);
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
   * @param {object} handlers - Handler object with onRequestPairingCode and onResetSession callbacks
   */
  start(handlers = {}) {
    if (handlers.onRequestPairingCode) this.pairingHandler = handlers.onRequestPairingCode;
    if (handlers.onResetSession) this.resetHandler = handlers.onResetSession;

    if (this.server) return Promise.resolve(this.server);

    return new Promise((resolve) => {
      this.server = this.app.listen(config.port, () => {
        logger.info(`Web QR & Control Panel running on port ${config.port}`);
        resolve(this.server);
      });
    });
  }
}

export const qrServer = new QRServer();
export default qrServer;
