import { REST, Routes } from 'discord.js';

import { createApplication } from '../src/app.js';
import { environment } from '../src/config/index.js';

const { commands } = createApplication();
const body = commands.map((command) => command.data.toJSON());
const rest = new REST({ version: '10' }).setToken(environment.DISCORD_TOKEN);
const route = environment.DISCORD_DEV_GUILD_ID
  ? Routes.applicationGuildCommands(environment.DISCORD_CLIENT_ID, environment.DISCORD_DEV_GUILD_ID)
  : Routes.applicationCommands(environment.DISCORD_CLIENT_ID);

await rest.put(route, { body });
console.log(
  `Publicados ${String(body.length)} comando(s) ${environment.DISCORD_DEV_GUILD_ID ? 'no servidor de desenvolvimento' : 'globalmente'}.`,
);
