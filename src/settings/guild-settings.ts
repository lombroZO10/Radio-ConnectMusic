import { z } from 'zod';

export const guildSettingsSchema = z.object({
  guildId: z.string().regex(/^\d+$/),
  voiceChannelId: z.string().regex(/^\d+$/),
  stationId: z
    .string()
    .min(2)
    .max(32)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  defaultStationId: z
    .string()
    .min(2)
    .max(32)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  fallbackStationId: z
    .string()
    .min(2)
    .max(32)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
});

export const guildSettingsFileSchema = z.object({
  version: z.literal(1),
  guilds: z.array(guildSettingsSchema),
});

export type GuildSettings = z.infer<typeof guildSettingsSchema>;

export interface GuildSettingsRepository {
  get(guildId: string): GuildSettings | undefined;
  list(): readonly GuildSettings[];
  setVoiceChannel(guildId: string, voiceChannelId: string): void;
  clearVoiceChannel(guildId: string): void;
  setDefaultStation(guildId: string, stationId: string): void;
  setFallbackStation(guildId: string, stationId: string): void;
  clearFallbackStation(guildId: string): void;
  setStation(guildId: string, stationId: string): void;
  clearStation(guildId: string): void;
}
