import { describe, expect, it } from 'vitest';

import { environmentSchema, radioConfigSchema } from '../src/config/schemas.js';

describe('radioConfigSchema', () => {
  it('rejeita stream que não seja HTTP ou HTTPS', () => {
    const result = radioConfigSchema.safeParse({
      branding: {
        name: 'Radio Connect Music 24/7',
        shortName: 'Connect Music',
        color: '#7C3AED',
        websiteUrl: null,
        logoUrl: null,
      },
      discord: { activity: 'Música 24/7' },
      playback: {
        connectionTimeoutMs: 20_000,
        voiceConnectAttempts: 1,
        maxReconnectAttempts: 3,
        reconnectDelayMs: 3_000,
        maxReconnectDelayMs: 60_000,
        voiceRecoveryTimeoutMs: 5_000,
        healthCheckIntervalMs: 30_000,
        minimumStablePlaybackMs: 30_000,
        audioBitrateKbps: 128,
        encoderComplexity: 0,
      },
      logging: { level: 'info' },
      stations: [
        {
          id: 'invalida',
          name: 'Inválida',
          description: 'Fonte inválida para teste.',
          genres: ['Teste'],
          streamUrl: 'ftp://example.com/audio',
          homepageUrl: 'https://example.com',
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe('environmentSchema', () => {
  it('aceita variáveis opcionais vazias como ausentes', () => {
    const environment = environmentSchema.parse({
      DISCORD_TOKEN: 'token-de-teste',
      DISCORD_CLIENT_ID: '123456789',
      DISCORD_DEV_GUILD_ID: '',
      LOG_LEVEL: '',
    });

    expect(environment.DISCORD_DEV_GUILD_ID).toBeUndefined();
    expect(environment.LOG_LEVEL).toBeUndefined();
  });
});
