import { generateDependencyReport } from '@discordjs/voice';

import { createApplication } from './app.js';
import { environment } from './config/index.js';
import { configureFfmpeg } from './radio/configure-ffmpeg.js';
import { logger } from './shared/logger.js';
import { printStartupBanner } from './shared/startup-banner.js';

printStartupBanner();
configureFfmpeg(logger);
const { client } = createApplication();
logger.debug({ voiceDependencies: generateDependencyReport() }, 'Dependências de voz verificadas');

try {
  await client.login(environment.DISCORD_TOKEN);
} catch (error) {
  logger.fatal({ err: error }, 'Não foi possível iniciar o bot');
  process.exitCode = 1;
}
