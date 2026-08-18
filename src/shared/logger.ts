import pino from 'pino';

import { config, environment } from '../config/index.js';

const loggerOptions = {
  level: environment.LOG_LEVEL ?? config.logging.level,
  base: { service: 'radio-connect-music' },
  redact: {
    paths: ['token', 'DISCORD_TOKEN', '*.token', '*.authorization'],
    censor: '[REDACTED]',
  },
};

// Humans get a readable, colored console. Hosting panels and redirected output
// keep structured JSON so logs remain searchable and machine-readable.
const usePrettyLogs = process.env.LOG_FORMAT === 'pretty' || process.stdout.isTTY;
const destination = usePrettyLogs
  ? pino.transport({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
        singleLine: true,
        ignore: 'pid,hostname',
      },
    })
  : pino.destination(1);

export const logger = pino(loggerOptions, destination);
