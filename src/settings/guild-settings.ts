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
  controlRoleIds: z.array(z.string().regex(/^\d+$/)).max(10).optional(),
  configRoleIds: z.array(z.string().regex(/^\d+$/)).max(10).optional(),
  publicControlEnabled: z.boolean().optional(),
  announcementChannelId: z.string().regex(/^\d+$/).optional(),
  announcePlayback: z.boolean().optional(),
  announceRecovery: z.boolean().optional(),
  announceFallback: z.boolean().optional(),
  quietMode: z.boolean().optional(),
  liveStatusEnabled: z.boolean().optional(),
  liveStatusMessageId: z.string().regex(/^\d+$/).optional(),
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
  setControlRoles(guildId: string, roleIds: string[]): void;
  setConfigRoles(guildId: string, roleIds: string[]): void;
  setPublicControlEnabled(guildId: string, enabled: boolean): void;
  setAnnouncementChannel(guildId: string, channelId: string): void;
  clearAnnouncementChannel(guildId: string): void;
  setMessagePreference(guildId: string, preference: 'announcePlayback' | 'announceRecovery' | 'announceFallback' | 'quietMode' | 'liveStatusEnabled', enabled: boolean): void;
  setLiveStatusMessage(guildId: string, messageId: string | undefined): void;
  setStation(guildId: string, stationId: string): void;
  clearStation(guildId: string): void;
}
