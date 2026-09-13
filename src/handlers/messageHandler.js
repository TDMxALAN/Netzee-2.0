import config from '../config/config.js';
import commandHandler from './commandHandler.js';
import logger from '../utils/logger.js';

/**
 * Message Handler Module
 * Evaluates incoming messages against prefix requirements:
 * - Group Chats: Requires '!' or '.' at the beginning.
 * - DM Chats: Works with any prefix or without a prefix (prefix-less).
 */
export async function handleIncomingMessage(sock, messageInfo) {
  try {
    const { messages, type } = messageInfo;

    // Only process 'notify' (new incoming message) events
    if (type !== 'notify' || !messages || messages.length === 0) {
      return;
    }

    const msg = messages[0];

    // Ignore status updates, broadcast messages, or messages without content
    if (!msg.message || msg.key.remoteJid === 'status@broadcast') {
      return;
    }

    // Ignore messages sent by the bot itself
    if (msg.key.fromMe) {
      return;
    }

    const remoteJid = msg.key.remoteJid;
    const isGroup = remoteJid.endsWith('@g.us');

    // Extract text content from various message types (text, extended text, image/video captions)
    const body = (
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption ||
      ''
    ).trim();

    if (!body) {
      return;
    }

    let commandName = '';
    let args = [];
    let usedPrefix = '';
    let isCommandMatched = false;

    // Allowed group prefixes from config (['!', '.'])
    const groupPrefixes = config.groupPrefixes;

    if (isGroup) {
      // GROUP CHAT RULE: Must start strictly with '!' or '.'
      const matchingPrefix = groupPrefixes.find(p => body.startsWith(p));
      if (!matchingPrefix) {
        // Ignore messages in groups that don't start with ! or .
        return;
      }

      usedPrefix = matchingPrefix;
      const contentWithoutPrefix = body.slice(matchingPrefix.length).trim();
      const parts = contentWithoutPrefix.split(/\s+/);
      commandName = parts[0];
      args = parts.slice(1);
      isCommandMatched = true;
    } else {
      // DM CHAT RULE: Works with any prefix or prefix-less
      // 1. Check if it starts with standard group prefixes (! or .)
      const matchingPrefix = groupPrefixes.find(p => body.startsWith(p));

      if (matchingPrefix) {
        usedPrefix = matchingPrefix;
        const contentWithoutPrefix = body.slice(matchingPrefix.length).trim();
        const parts = contentWithoutPrefix.split(/\s+/);
        commandName = parts[0];
        args = parts.slice(1);
        isCommandMatched = true;
      } else {
        // 2. Check for other single-character prefixes (e.g. /, #, $)
        const symbolPrefixMatch = body.match(/^^[^\w\s]/);
        if (symbolPrefixMatch) {
          usedPrefix = symbolPrefixMatch[0];
          const contentWithoutPrefix = body.slice(usedPrefix.length).trim();
          const parts = contentWithoutPrefix.split(/\s+/);
          commandName = parts[0];
          args = parts.slice(1);
          isCommandMatched = true;
        } else {
          // 3. Prefix-less handling in DM: evaluate first word as potential command
          const parts = body.split(/\s+/);
          const potentialCmd = parts[0];

          // Verify if potentialCmd matches a registered command or alias
          const targetCommand = commandHandler.getCommand(potentialCmd);
          if (targetCommand) {
            usedPrefix = '';
            commandName = potentialCmd;
            args = parts.slice(1);
            isCommandMatched = true;
          }
        }
      }
    }

    if (!isCommandMatched || !commandName) {
      return;
    }

    // Find registered command
    const command = commandHandler.getCommand(commandName);
    if (!command) {
      return;
    }

    logger.info({
      command: command.name,
      from: remoteJid,
      isGroup,
      usedPrefix
    }, `Executing command [${command.name}]`);

    // Helper context passed to command execution
    const context = {
      sock,
      msg,
      remoteJid,
      isGroup,
      body,
      args,
      usedPrefix,
      reply: async (text) => {
        return await sock.sendMessage(remoteJid, { text }, { quoted: msg });
      }
    };

    // Execute the command function
    await command.execute(context);

  } catch (err) {
    logger.error({ err }, 'Error processing incoming message');
  }
}

export default handleIncomingMessage;
