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
      const station = guildSettings.stationId
        ? catalog.getById(guildSettings.stationId)
        : undefined;
      if (station) {
        await radio.play(channel, station);
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
