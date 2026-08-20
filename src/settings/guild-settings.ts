import { z } from 'zod';

const notificationTemplateSchema = z.object({
  title: z.string().min(1).max(256),
  description: z.string().min(1).max(4000),
  footer: z.string().max(2048),
  color: z.number().int().min(0).max(0xffffff),
});

export const notificationTemplatesSchema = z.object({
  playbackStart: notificationTemplateSchema.optional(),
  voiceRecovered: notificationTemplateSchema.optional(),
  fallbackActivated: notificationTemplateSchema.optional(),
});

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
  notificationTemplates: notificationTemplatesSchema.optional(),
  mentionRoleId: z.string().regex(/^\d+$/).optional(),
  allowEveryoneMention: z.boolean().optional(),
  allowHereMention: z.boolean().optional(),
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
  setNotificationTemplates(guildId: string, templates: GuildSettings['notificationTemplates']): void;
  setMentionSettings(guildId: string, settings: Pick<GuildSettings, 'mentionRoleId' | 'allowEveryoneMention' | 'allowHereMention'>): void;
  setStation(guildId: string, stationId: string): void;
  clearStation(guildId: string): void;
}
