import { spawnSync } from 'node:child_process';

import type { logger as rootLogger } from '../shared/logger.js';

type Logger = typeof rootLogger;

export function configureFfmpeg(logger: Logger): void {
  if (process.platform !== 'linux' || process.env.FFMPEG_BIN) return;

  const probe = spawnSync('ffmpeg', ['-version'], {
    encoding: 'utf8',
    timeout: 5_000,
    windowsHide: true,
  });
  if (probe.status === 0) {
    process.env.FFMPEG_BIN = 'ffmpeg';
    const firstLine = probe.stdout.split(/\r?\n/u)[0];
    logger.info({ ffmpeg: firstLine }, 'FFmpeg do sistema selecionado');
    return;
  }

  logger.warn(
    { err: probe.error, status: probe.status },
    'FFmpeg do sistema indisponível; usando o binário estático',
  );
}
