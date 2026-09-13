import commandHandler from '../../handlers/commandHandler.js';
import config from '../../config/config.js';

/**
 * Help Command
 * Displays a formatted menu of all available commands categorized by folder.
 */
export default {
  name: 'help',
  description: 'Displays the command menu and instructions',
  aliases: ['menu', 'commands', 'h'],
  category: 'general',

  /**
   * Executes the help command.
   * @param {object} ctx - Execution context
   */
  async execute(ctx) {
    const categorized = commandHandler.getCommandsByCategory();
    
    let helpText = `⚡ *${config.botName} Command Menu* ⚡\n\n`;
    
    helpText += `ℹ️ *Prefix Rules:*\n`;
    helpText += `• In Groups: Use \`!\` or \`.\` (e.g. \`!ping\` or \`.help\`)\n`;
    helpText += `• In DM: Any prefix or prefix-less (e.g. \`ping\` or \`checknumber\`)\n\n`;

    for (const [category, commands] of Object.entries(categorized)) {
      const catName = category.toUpperCase();
      helpText += `📁 *${catName} COMMANDS*\n`;

      commands.forEach((cmd) => {
        const aliases = cmd.aliases ? ` (${cmd.aliases.join(', ')})` : '';
        helpText += `  • *${cmd.name}*${aliases}: ${cmd.description}\n`;
      });
      helpText += `\n`;
    }

    helpText += `💡 *Tip:* Use \`checknumber <phone>\` to validate and format any phone number!`;

    await ctx.reply(helpText);
  }
};
