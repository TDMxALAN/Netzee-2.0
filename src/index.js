import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import config from './config/config.js';
import logger, { baileysLogger } from './utils/logger.js';
import qrServer from './server/qrServer.js';
import commandHandler from './handlers/commandHandler.js';
import handleIncomingMessage from './handlers/messageHandler.js';

/**
 * Main Application Initializer
 * Starts the Express QR Web Server, loads commands, and handles the Baileys WhatsApp Web socket lifecycle.
 */
async function startBot() {
  logger.info(`Starting ${config.botName}...`);

  // 1. Start Web Server for Railway PORT to expose live QR Code UI
  await qrServer.start();

  // 2. Load all command modules from src/commands/
  await commandHandler.loadCommands();

  // 3. Initialize Baileys multi-file authentication state
  const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir);

  // 4. Fetch latest WhatsApp Web version
  const { version, isLatest } = await fetchLatestBaileysVersion();
  logger.info(`Using Baileys WA version v${version.join('.')}, isLatest: ${isLatest}`);

  // 5. Create WhatsApp Web Socket connection
  const sock = makeWASocket({
    version,
    auth: state,
    logger: baileysLogger,
    printQRInTerminal: true, // Also print to terminal logs for Railway log viewer
    browser: [config.botName, 'Chrome', '1.0.0'],
    generateHighQualityLinkPreview: true
  });

  // Save credentials whenever auth state updates
  sock.ev.on('creds.update', saveCreds);

  // 6. Handle Connection Updates (QR code generation, connection status, reconnects)
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Update live QR Code on Express Web UI
    if (qr) {
      qrServer.setQR(qr);
    }

    if (connection === 'connecting') {
      qrServer.setStatus('CONNECTING');
      logger.info('Connecting to WhatsApp Servers...');
    } else if (connection === 'open') {
      qrServer.setStatus('CONNECTED', sock.user);
      logger.info(`✅ Successfully connected as [${sock.user.name || sock.user.id}]`);
    } else if (connection === 'close') {
      qrServer.setStatus('DISCONNECTED');
      const statusCode = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output?.statusCode
        : null;
      
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      logger.warn({ statusCode, shouldReconnect }, `Connection closed. ${shouldReconnect ? 'Reconnecting...' : 'Logged out.'}`);

      if (shouldReconnect) {
        setTimeout(startBot, 3000);
      } else {
        logger.error('Session logged out. Please restart container to scan new QR code.');
      }
    }
  });

  // 7. Handle Incoming WhatsApp Messages
  sock.ev.on('messages.upsert', async (messageInfo) => {
    await handleIncomingMessage(sock, messageInfo);
  });
}

// Global error handlers to prevent silent crashes on Railway
process.on('unhandledRejection', (err) => {
  logger.error({ err }, 'Unhandled Promise Rejection caught');
});

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught Exception caught');
});

// Launch bot application
startBot();
