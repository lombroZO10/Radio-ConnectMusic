import pino from 'pino';

import { config, environment } from '../config/index.js';

export const logger = pino(
  {
    level: environment.LOG_LEVEL ?? config.logging.level,
    base: { service: 'radio-connect-music' },
    redact: {
      paths: ['token', 'DISCORD_TOKEN', '*.token', '*.authorization'],
      censor: '[REDACTED]',
    },
  },
  pino.destination(1),
);
