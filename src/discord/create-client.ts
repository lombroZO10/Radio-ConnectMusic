import {
  ActivityType,
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  MessageFlags,
  type Interaction,
} from 'discord.js';
import { EmbedBuilder } from 'discord.js';

import { config } from '../config/index.js';
import type { RadioManager } from '../radio/radio-manager.js';
import type { StationCatalog } from '../radio/station-catalog.js';
import type { GuildSettingsRepository } from '../settings/guild-settings.js';
import { logger } from '../shared/logger.js';
import type { DiscordCommand } from './command.js';
import type { ComponentHandler } from './component.js';
import { restoreConfiguredVoiceChannels } from './restore-voice-channels.js';
import type { RadioSessionEvent } from '../radio/radio-session.js';
import { customEmojis } from './custom-emojis.js';

export function createDiscordClient(
  commands: readonly DiscordCommand[],
  componentHandlers: readonly ComponentHandler[],
  radio: RadioManager,
  settings: GuildSettingsRepository,
  catalog: StationCatalog,
): Client {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });
  const commandMap = new Collection<string, DiscordCommand>();
  for (const command of commands) commandMap.set(command.data.name, command);

  radio.onEvent((event) => {
    void sendRadioAnnouncement(client, settings, event);
  });

  let shutdownTask: Promise<void> | undefined;
  const shutdown = (signal: string, exitCode = 0): Promise<void> => {
    if (shutdownTask) return shutdownTask;
    shutdownTask = (async () => {
      logger.info({ signal, exitCode }, 'Encerrando aplicação');
      process.exitCode = exitCode;
      const forceExitTimer = setTimeout(() => {
        logger.fatal({ signal, exitCode }, 'Tempo limite do encerramento excedido');
        process.exit(exitCode || 1);
      }, 10_000);
      try {
        radio.stopAll();
        await client.destroy();
      } finally {
        clearTimeout(forceExitTimer);
      }
    })();
    return shutdownTask;
  };

  client.once(Events.ClientReady, (readyClient) => {
    readyClient.user.setActivity(config.discord.activity, { type: ActivityType.Listening });
    logger.info(
      { user: readyClient.user.tag, guilds: readyClient.guilds.cache.size },
      'Bot conectado ao Discord',
    );
    void restoreConfiguredVoiceChannels(readyClient, settings, radio, catalog, logger).catch(
      (error: unknown) => {
        logger.error({ err: error }, 'Falha inesperada ao restaurar conexões permanentes');
      },
    );
  });

  client.on(Events.InteractionCreate, (interaction) => {
    void executeInteraction(interaction).catch(async (error: unknown) => {
      logger.error(
        {
          err: error,
          interactionId: interaction.id,
          command: 'commandName' in interaction ? interaction.commandName : undefined,
        },
        'Falha ao executar interação',
      );
      try {
        await respondToInteractionError(interaction, error);
      } catch (responseError) {
        logger.warn(
          { err: responseError, interactionId: interaction.id },
          'Não foi possível enviar a mensagem de erro da interação',
        );
      }
    });
  });

  const executeInteraction = async (interaction: Interaction): Promise<void> => {
    if (interaction.isAutocomplete()) {
      await commandMap.get(interaction.commandName)?.autocomplete?.(interaction);
      return;
    }
    if (interaction.isMessageComponent()) {
      const handler = componentHandlers.find((item) => item.canHandle(interaction.customId));
      if (handler) await handler.execute(interaction);
      return;
    }
    if (!interaction.isChatInputCommand()) return;
    const command = commandMap.get(interaction.commandName);
    if (!command) return;
    await command.execute({ interaction });
  };

  client.on(Events.Error, (error) => {
    logger.error({ err: error }, 'Erro do cliente Discord');
  });
  client.on(Events.Warn, (message) => {
    logger.warn({ warning: message }, 'Aviso do cliente Discord');
  });
  client.on(Events.ShardError, (error, shardId) => {
    logger.error({ err: error, shardId }, 'Erro na conexão do gateway Discord');
  });
  client.on(Events.ShardReconnecting, (shardId) => {
    logger.warn({ shardId }, 'Reconectando ao gateway Discord');
  });
  client.on(Events.ShardResume, (shardId, replayedEvents) => {
    logger.info({ shardId, replayedEvents }, 'Conexão com o gateway Discord retomada');
  });
  client.on(Events.Invalidated, () => {
    logger.fatal('Sessão do Discord invalidada; solicitando reinício limpo');
    void shutdown('discord-invalidated', 1);
  });

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.once('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Exceção não tratada; solicitando reinício limpo');
    void shutdown('uncaughtException', 1);
  });
  process.once('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'Promise rejeitada sem tratamento; solicitando reinício limpo');
    void shutdown('unhandledRejection', 1);
  });

  return client;
}

async function sendRadioAnnouncement(
  client: Client,
  settings: GuildSettingsRepository,
  event: RadioSessionEvent,
): Promise<void> {
  const saved = settings.get(event.guildId);
  if (!saved?.announcementChannelId || saved.quietMode) return;
  const enabled = event.type === 'playback-start'
    ? saved.announcePlayback
    : event.type === 'fallback'
      ? saved.announceFallback
      : saved.announceRecovery;
  if (!enabled) return;
  try {
    const channel = await client.channels.fetch(saved.announcementChannelId);
    if (!channel?.isTextBased() || !('send' in channel)) return;
    const [emoji, title, description, color] = event.type === 'playback-start'
      ? [customEmojis.music, 'Transmissão iniciada', `A rádio está transmitindo **${event.station.name}**.`, 0x22c55e]
      : event.type === 'fallback'
        ? [customEmojis.sparkle, 'Estação reserva acionada', `A estação principal apresentou instabilidade. A rádio mudou para **${event.station.name}**.`, 0xf59e0b]
        : [customEmojis.audacity, 'Conexão recuperada', `A transmissão de **${event.station.name}** voltou ao canal de voz.`, 0x3b82f6];
    await channel.send({
      embeds: [new EmbedBuilder().setColor(color).setTitle(`${emoji} ${title}`).setDescription(description).setFooter({ text: config.branding.name }).setTimestamp()],
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    logger.warn({ err: error, guildId: event.guildId, channelId: saved.announcementChannelId }, 'Não foi possível publicar notificação da rádio');
  }
}

async function respondToInteractionError(interaction: Interaction, error: unknown): Promise<void> {
  if (!interaction.isRepliable()) {
    if (interaction.isAutocomplete() && !interaction.responded) await interaction.respond([]);
    return;
  }
  const content =
    error instanceof Error &&
    (error.name === 'AbortError' || error.message.includes('IP discovery'))
      ? 'Não foi possível completar a conexão com o canal de voz. Tente novamente em instantes.'
      : 'Ocorreu um erro ao executar esse comando.';
  if (interaction.deferred) {
    await interaction.editReply({ content });
  } else if (interaction.replied) {
    await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
  } else {
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  }
}
