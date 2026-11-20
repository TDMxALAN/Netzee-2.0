import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Command Handler Class
 * Dynamically scans and loads all command modules located inside subfolders of `src/commands/`.
 * Manages the command registry for the bot.
 */
class CommandHandler {
  constructor() {
    this.commands = new Map();
    this.aliases = new Map();
  }

  /**
   * Recursively loads all command JavaScript files from `src/commands`.
   */
  async loadCommands() {
    const commandsDir = path.join(__dirname, '../commands');
    this.commands.clear();
    this.aliases.clear();

    if (!fs.existsSync(commandsDir)) {
      logger.warn(`Commands directory not found at: ${commandsDir}`);
      return;
    }

    const categories = fs.readdirSync(commandsDir);

    for (const category of categories) {
      const categoryPath = path.join(commandsDir, category);
      if (fs.statSync(categoryPath).isDirectory()) {
        const commandFiles = fs.readdirSync(categoryPath).filter(file => file.endsWith('.js'));

        for (const file of commandFiles) {
          try {
            const filePath = path.join(categoryPath, file);
            const fileUrl = pathToFileURL(filePath).href;
            const commandModule = await import(fileUrl);
            const command = commandModule.default;

            if (command && command.name) {
              command.category = category;
              this.commands.set(command.name.toLowerCase(), command);

              // Register aliases if defined
              if (Array.isArray(command.aliases)) {
                command.aliases.forEach(alias => {
                  this.aliases.set(alias.toLowerCase(), command.name.toLowerCase());
                });
              }
              logger.info(`Loaded command: [${category}/${command.name}]`);
            }
          } catch (err) {
            logger.error({ err, file }, `Failed to load command file: ${file}`);
          }
        }
      }
    }

    logger.info(`Total commands loaded: ${this.commands.size}`);
  }

  /**
   * Retrieves a registered command by its primary name or alias.
   * @param {string} name - Command name or alias
   * @returns {object|null} Command module or null
   */
  getCommand(name) {
    if (!name) return null;
    const lowerName = name.toLowerCase();
    
    if (this.commands.has(lowerName)) {
      return this.commands.get(lowerName);
    }
    
    if (this.aliases.has(lowerName)) {
      const primaryName = this.aliases.get(lowerName);
      return this.commands.get(primaryName);
    }
    
    return null;
  }

  /**
   * Returns all loaded commands grouped by category.
   * @returns {object} Object mapping category names to command lists
   */
  getCommandsByCategory() {
    const categories = {};
    for (const [_, command] of this.commands) {
      const cat = command.category || 'general';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(command);
    }
    return categories;
  }
}

export const commandHandler = new CommandHandler();
export default commandHandler;
