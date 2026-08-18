import { describe, expect, it } from 'vitest';

import type { RadioConfig, Station } from '../src/config/schemas.js';
import { buildFfmpegArguments } from '../src/radio/create-transcoder.js';

const station: Station = {
  id: 'radio-teste',
  name: 'Rádio Teste',
  description: 'Fonte utilizada nos testes do encoder.',
  genres: ['Teste'],
  country: 'BR',
  language: 'pt',
  streamUrl: 'https://example.com/radio',
  homepageUrl: 'https://example.com',
  logoUrl: null,
  enabled: true,
};

const playback = {
  connectionTimeoutMs: 15_000,
  voiceConnectAttempts: 1,
  maxReconnectAttempts: 6,
  reconnectDelayMs: 5_000,
  maxReconnectDelayMs: 120_000,
  voiceRecoveryTimeoutMs: 5_000,
  healthCheckIntervalMs: 60_000,
  minimumStablePlaybackMs: 30_000,
  audioBitrateKbps: 128,
  encoderComplexity: 0,
} satisfies RadioConfig['playback'];

describe('buildFfmpegArguments', () => {
  it('mantém áudio estéreo em 48 kHz e Opus 128 kbps com baixo custo de CPU', () => {
    const args = buildFfmpegArguments(station, playback);

    expect(args).toEqual(
      expect.arrayContaining([
        '-acodec',
        'libopus',
        '-b:a',
        '128k',
        '-compression_level',
        '0',
        '-ar',
        '48000',
        '-ac',
        '2',
        '-threads',
        '1',
      ]),
    );
  });
});
