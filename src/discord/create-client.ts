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
import { NotificationQueue } from './notification-queue.js';

const notificationQueue = new NotificationQueue();

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
    sendRadioAnnouncement(client, settings, event);
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
    if (interaction.isMessageComponent() || interaction.isModalSubmit()) {
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

function sendRadioAnnouncement(
  client: Client,
  settings: GuildSettingsRepository,
  event: RadioSessionEvent,
): void {
  notificationQueue.enqueue(event.guildId, `${event.type}:${event.station?.id ?? 'none'}`, () => sendRadioAnnouncementNow(client, settings, event));
}

async function sendRadioAnnouncementNow(
  client: Client,
  settings: GuildSettingsRepository,
  event: RadioSessionEvent,
): Promise<void> {
  const saved = settings.get(event.guildId);
  if (!saved?.announcementChannelId || (saved.quietMode && !saved.liveStatusEnabled)) return;
  const enabled = event.type === 'playback-start'
    ? saved.announcePlayback
    : event.type === 'fallback'
      ? saved.announceFallback
      : event.type === 'voice-recovered'
        ? saved.announceRecovery
        : false;
  if (!enabled && !saved.liveStatusEnabled) return;
  try {
    const channel = await client.channels.fetch(saved.announcementChannelId).catch(() => null);
    if (!channel) {
      settings.clearAnnouncementChannel(event.guildId);
      logger.warn({ guildId: event.guildId, channelId: saved.announcementChannelId }, 'Canal de notificações removido; configuração limpa automaticamente');
      return;
    }
    if (!channel.isTextBased() || !('send' in channel)) return;
    const stationName = event.station?.name ?? 'Nenhuma estação';
    const [emoji, title, description, color] = event.type === 'playback-start'
      ? [customEmojis.music, 'Transmissão iniciada', `A rádio está transmitindo **${stationName}**.`, 0x22c55e]
      : event.type === 'fallback'
        ? [customEmojis.sparkle, 'Estação reserva acionada', `A rádio mudou automaticamente para **${stationName}**.`, 0xf59e0b]
        : event.type === 'voice-recovered'
          ? [customEmojis.audacity, 'Conexão recuperada', `A transmissão de **${stationName}** voltou ao canal de voz.`, 0x3b82f6]
          : [customEmojis.close, 'Transmissão encerrada', 'A rádio não está reproduzindo áudio neste momento.', 0x64748b];
    const status = event.status;
    const duration = status?.playbackStartedAt ? formatDuration(Date.now() - status.playbackStartedAt) : '—';
    const genres = event.station?.genres.join(' • ') ?? '—';
    const lastError = status?.lastError?.message ?? 'Nenhum erro registrado';
    const mentionContent = [saved.allowEveryoneMention ? '@everyone' : '', saved.allowHereMention ? '@here' : '', saved.mentionRoleId ? `<@&${saved.mentionRoleId}>` : ''].filter(Boolean).join(' ');
    const payload = {
      ...(mentionContent ? { content: mentionContent } : {}),
      embeds: [new EmbedBuilder().setColor(color).setTitle(`${emoji} ${title}`).setDescription(description).addFields({ name: `${customEmojis.radio} Canal de voz`, value: event.channelId ? `<#${event.channelId}>` : '—', inline: true }, { name: `${customEmojis.music} Gênero`, value: genres, inline: true }, { name: `${customEmojis.audacity} Áudio`, value: status?.audioStatus ?? 'idle', inline: true }, { name: `${customEmojis.loading} Duração`, value: duration, inline: true }, { name: `${customEmojis.info} Último erro`, value: lastError.slice(0, 1024), inline: false }).setFooter({ text: config.branding.name }).setTimestamp()],
      allowedMentions: { parse: [...(saved.allowEveryoneMention ? ['everyone' as const] : []), ...(saved.allowHereMention ? ['everyone' as const] : [])], roles: saved.mentionRoleId ? [saved.mentionRoleId] : [] },
    };
    if (saved.liveStatusEnabled && saved.liveStatusMessageId && 'messages' in channel) {
      const message = await channel.messages.fetch(saved.liveStatusMessageId).catch(() => null);
      if (message) {
        await message.edit(payload);
        return;
      }
    }
    const sent = await channel.send(payload);
    if (saved.liveStatusEnabled) settings.setLiveStatusMessage(event.guildId, sent.id);
  } catch (error) {
    logger.warn({ err: error, guildId: event.guildId, channelId: saved.announcementChannelId }, 'Não foi possível publicar notificação da rádio');
  }
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours ? `${String(hours)}h ${String(minutes).padStart(2, '0')}m` : `${String(minutes)}m ${String(seconds).padStart(2, '0')}s`;
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
