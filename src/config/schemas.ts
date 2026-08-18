import { z } from 'zod';

const urlOrNullSchema = z.url().nullable();

export const stationSchema = z.object({
  id: z
    .string()
    .min(2)
    .max(32)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().min(2).max(80),
  description: z.string().min(2).max(200),
  genres: z.array(z.string().min(2).max(40)).min(1),
  country: z.string().length(2).default('BR'),
  language: z.string().length(2).default('pt'),
  streamUrl: z.url().refine((url) => /^https?:\/\//u.test(url), 'Use uma URL HTTP ou HTTPS.'),
  homepageUrl: z.url(),
  logoUrl: urlOrNullSchema.default(null),
  enabled: z.boolean().default(true),
});

export const radioConfigSchema = z.object({
  branding: z.object({
    name: z.string().min(2),
    shortName: z.string().min(2).max(32),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    websiteUrl: urlOrNullSchema,
    logoUrl: urlOrNullSchema,
  }),
  discord: z.object({
    activity: z.string().min(2).max(128),
  }),
  playback: z.object({
    connectionTimeoutMs: z.number().int().min(5_000).max(60_000),
    voiceConnectAttempts: z.number().int().min(1).max(5),
    maxReconnectAttempts: z.number().int().min(1).max(10),
    reconnectDelayMs: z.number().int().min(500).max(30_000),
    maxReconnectDelayMs: z.number().int().min(5_000).max(300_000),
    voiceRecoveryTimeoutMs: z.number().int().min(1_000).max(30_000),
    healthCheckIntervalMs: z.number().int().min(10_000).max(300_000),
    minimumStablePlaybackMs: z.number().int().min(5_000).max(120_000),
    audioBitrateKbps: z.number().int().min(64).max(256),
    encoderComplexity: z.number().int().min(0).max(10),
  }),
  logging: z.object({
    level: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']),
  }),
  stations: z.array(stationSchema),
});

export const environmentSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN é obrigatório.'),
  DISCORD_CLIENT_ID: z.string().regex(/^\d+$/, 'DISCORD_CLIENT_ID deve ser numérico.'),
  DISCORD_DEV_GUILD_ID: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().regex(/^\d+$/).optional(),
  ),
  LOG_LEVEL: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  ),
});

export type RadioConfig = z.infer<typeof radioConfigSchema>;
export type Station = z.infer<typeof stationSchema>;
export type Environment = z.infer<typeof environmentSchema>;
