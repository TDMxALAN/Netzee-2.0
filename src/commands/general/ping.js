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
    const frames = [
      '○○○○○',
      '●○○○○',
      '●●○○○',
      '●●●○○',
      '●●●●○',
      '●●●●●'
    ];

    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const start = Date.now();

    let sentMsg = await ctx.reply(frames[0]);
    await delay(500);

    for (let i = 1; i < frames.length; i++) {
      if (sentMsg?.key) {
        await ctx.sock.sendMessage(ctx.remoteJid, { text: frames[i], edit: sentMsg.key });
      } else {
        sentMsg = await ctx.reply(frames[i]);
      }
      await delay(500);
    }

    const latency = Date.now() - start;

    const responseText = `🤖 *${ctx.sock.user?.name || 'Netzee Bot'} Online*\n` +
      `⏱️ *Response Time:* ${latency}ms\n` +
      `📌 *Chat Type:* ${ctx.isGroup ? 'Group Chat' : 'Direct Message'}\n` +
      `✨ *Prefix Used:* "${ctx.usedPrefix || 'None (DM)'}"`;

    if (sentMsg?.key) {
      await ctx.sock.sendMessage(ctx.remoteJid, { text: responseText, edit: sentMsg.key });
    } else {
      await ctx.reply(responseText);
    }
  }
};
