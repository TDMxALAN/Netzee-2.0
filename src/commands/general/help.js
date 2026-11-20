import commandHandler from '../../handlers/commandHandler.js';
import config from '../../config/config.js';

/**
 * Help Command
 * Displays a simple menu of all available commands categorized by folder.
 */
export default {
  name: 'help',
  description: 'Displays the command menu',
  aliases: ['menu', 'commands', 'h'],
  category: 'general',

  async execute(ctx) {
    const categorized = commandHandler.getCommandsByCategory();

    let helpText = `⚡ *${config.botName}*\n\n`;

    for (const [category, commands] of Object.entries(categorized)) {
      helpText += `*${category.toUpperCase()}*\n`;
      commands.forEach((cmd) => {
        helpText += `  • *${cmd.name}* — ${cmd.description}\n`;
      });
      helpText += `\n`;
    }

    await ctx.reply(helpText);
  }
};
