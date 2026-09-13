/**
 * Ping Command
 * Checks bot response latency and server status.
 */
export default {
  name: 'ping',
  description: 'Check bot latency and server status',
  aliases: ['p', 'status', 'speed'],
  category: 'general',

  /**
   * Executes the ping command.
   * @param {object} ctx - Execution context containing sock, msg, reply, args
   */
  async execute(ctx) {
    const start = Date.now();
    const sentMsg = await ctx.reply('🏓 Pinging bot server...');
    const latency = Date.now() - start;

    const responseText = `🤖 *${ctx.sock.user?.name || 'Netzee Bot'} Online*\n` +
      `⏱️ *Response Time:* ${latency}ms\n` +
      `📌 *Chat Type:* ${ctx.isGroup ? 'Group Chat' : 'Direct Message'}\n` +
      `✨ *Prefix Used:* "${ctx.usedPrefix || 'None (DM)'}"`;

    await ctx.reply(responseText);
  }
};
