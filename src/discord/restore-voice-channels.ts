import { ChannelType, type Client } from 'discord.js';

import type { RadioManager } from '../radio/radio-manager.js';
import type { StationCatalog } from '../radio/station-catalog.js';
import { VoiceConnectionSupersededError } from '../radio/radio-session.js';
import type { GuildSettingsRepository } from '../settings/guild-settings.js';
import type { logger as rootLogger } from '../shared/logger.js';

type Logger = typeof rootLogger;

export async function restoreConfiguredVoiceChannels(
  client: Client<true>,
  settings: GuildSettingsRepository,
  radio: RadioManager,
  catalog: StationCatalog,
  logger: Logger,
): Promise<void> {
  for (const guildSettings of settings.list()) {
    try {
      const guild = await client.guilds.fetch(guildSettings.guildId);
      const channel = await guild.channels.fetch(guildSettings.voiceChannelId);
      if (channel?.type !== ChannelType.GuildVoice) {
        logger.warn(guildSettings, 'Canal de voz configurado não existe mais');
        continue;
      }
      const stationId = guildSettings.stationId ?? guildSettings.defaultStationId;
      const station = stationId ? catalog.getById(stationId) : undefined;
      const fallbackStation = guildSettings.fallbackStationId
        ? catalog.getById(guildSettings.fallbackStationId)
        : undefined;
      if (station) {
        await radio.play(channel, station, fallbackStation);
        logger.info(guildSettings, 'Canal e transmissão permanente restaurados');
      } else {
        await radio.connect(channel);
        logger.info(guildSettings, 'Canal de voz permanente restaurado');
      }
    } catch (error) {
      if (error instanceof VoiceConnectionSupersededError) {
        logger.info(
          guildSettings,
          'Restauração anterior substituída por uma configuração de canal mais recente',
        );
        continue;
      }
      logger.error({ err: error, ...guildSettings }, 'Falha ao restaurar canal de voz permanente');
    }
  }
}
