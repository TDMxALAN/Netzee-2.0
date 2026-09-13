import makeWASocket, {
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import fs from 'fs';
import path from 'path';
import config from './config/config.js';
import logger, { baileysLogger } from './utils/logger.js';
import qrServer from './server/qrServer.js';
import commandHandler from './handlers/commandHandler.js';
import handleIncomingMessage from './handlers/messageHandler.js';

let globalSock = null;
let isStarting = false;

/**
 * Clears the session directory to allow a clean re-pair if previous session keys become invalid.
 */
function cleanSessionDirectory() {
  try {
    if (fs.existsSync(config.sessionDir)) {
      logger.info(`Clearing session storage at ${config.sessionDir}...`);
      fs.rmSync(config.sessionDir, { recursive: true, force: true });
    }
  } catch (err) {
    logger.error({ err }, 'Failed to clear session directory');
  }
}

/**
 * Main Application Initializer
 * Starts the Express Web Server, loads commands, and manages Baileys socket connection state.
 */
async function startBot() {
  if (isStarting) return;
  isStarting = true;

  try {
    logger.info(`Starting ${config.botName}...`);

    // 1. Initialize Web Control Panel (if not already started)
    await qrServer.start({
      onRequestPairingCode: async (phoneNumber) => {
        if (!globalSock) {
          throw new Error('Bot socket is initializing. Please try again in 5 seconds.');
        }
        const cleanDigits = phoneNumber.replace(/[^\d]/g, '');
        logger.info(`Requesting 8-digit pairing code for phone: ${cleanDigits}`);
        const code = await globalSock.requestPairingCode(cleanDigits);
        return code;
      },
      onResetSession: async () => {
        logger.warn('User requested session reset from Web UI.');
        if (globalSock) {
          try { globalSock.end(undefined); } catch (e) {}
          globalSock = null;
        }
        cleanSessionDirectory();
        isStarting = false;
        setTimeout(startBot, 1000);
        return { success: true };
      }
    });

    // 2. Load commands dynamically
    await commandHandler.loadCommands();

    // 3. Multi-file auth state setup
    const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir);

    // 4. Fetch latest WA Web version with fallback
    let version = [2, 3000, 1015901307];
    try {
      const versionResult = await fetchLatestBaileysVersion();
      version = versionResult.version;
      logger.info(`Using WhatsApp Web version v${version.join('.')}`);
    } catch (err) {
      logger.warn('Could not fetch latest WA version remotely, using fallback stable version.');
    }

    // 5. Initialize WASocket with Signal Key Store caching and Linux Chrome browser profile
    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, baileysLogger)
      },
      logger: baileysLogger,
      printQRInTerminal: true,
      browser: Browsers.ubuntu('Chrome'), // Recognized standard browser tuple
      syncFullHistory: false, // Prevents history sync timeouts during pairing
      markOnlineOnConnect: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      generateHighQualityLinkPreview: true
    });

    globalSock = sock;

    // Save auth credentials on update
    sock.ev.on('creds.update', saveCreds);

    // 6. Handle Connection State Events
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        qrServer.setQR(qr);
      }

      if (connection === 'connecting') {
        qrServer.setStatus('CONNECTING');
        logger.info('Connecting to WhatsApp Servers...');
      } else if (connection === 'open') {
        qrServer.setStatus('CONNECTED', sock.user);
        logger.info(`✅ Successfully connected to WhatsApp as [${sock.user?.name || sock.user?.id}]`);
      } else if (connection === 'close') {
        qrServer.setStatus('DISCONNECTED');
        const statusCode = (lastDisconnect?.error instanceof Boom)
          ? lastDisconnect.error.output?.statusCode
          : null;

        logger.warn({ statusCode, error: lastDisconnect?.error?.message }, 'WhatsApp connection closed.');

        globalSock = null;
        isStarting = false;

        // If logged out or unauthorized (401/403/428), clear session for fresh QR/Pairing Code
        if (statusCode === DisconnectReason.loggedOut || statusCode === 401 || statusCode === 403) {
          logger.warn('Session expired or logged out. Cleaning session files...');
          cleanSessionDirectory();
          setTimeout(startBot, 2000);
        } else {
          // Automatic reconnect for temporary network interruptions (e.g. 515 restart required)
          setTimeout(startBot, 2000);
        }
      }
    });

    // 7. Handle incoming messages
    sock.ev.on('messages.upsert', async (messageInfo) => {
      await handleIncomingMessage(sock, messageInfo);
    });

  } catch (err) {
    logger.error({ err }, 'Failed to start bot application');
    isStarting = false;
    setTimeout(startBot, 5000);
  }
}

// Unhandled exception handlers
process.on('unhandledRejection', (err) => {
  logger.error({ err }, 'Unhandled Promise Rejection caught');
});

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught Exception caught');
});

// Start the application
startBot();
