import commandHandler from '../src/handlers/commandHandler.js';

async function testCommands() {
  console.log('--- Testing Command Handler ---');
  await commandHandler.loadCommands();

  const pingCmd = commandHandler.getCommand('ping');
  const helpCmd = commandHandler.getCommand('help');
  const numCmd = commandHandler.getCommand('checknumber');
  const aliasCmd = commandHandler.getCommand('num');

  console.log('Ping command loaded:', !!pingCmd, pingCmd?.name);
  console.log('Help command loaded:', !!helpCmd, helpCmd?.name);
  console.log('Checknumber command loaded:', !!numCmd, numCmd?.name);
  console.log('Alias "num" points to:', aliasCmd?.name);
}

testCommands();
