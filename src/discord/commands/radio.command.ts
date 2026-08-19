import {
  ChannelType,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type GuildMember,
} from 'discord.js';
import { AudioPlayerStatus, VoiceConnectionStatus } from '@discordjs/voice';

import { config } from '../../config/index.js';
import type { StationCatalog } from '../../radio/station-catalog.js';
import { brandColor, stationEmbed } from '../embeds.js';
import type { DiscordCommand } from '../command.js';
import type { RadioManager } from '../../radio/radio-manager.js';
import type { GuildSettingsRepository } from '../../settings/guild-settings.js';
import { canControlRadio } from '../permissions.js';
import { customEmojis } from '../custom-emojis.js';

export function createRadioCommand(
  catalog: StationCatalog,
  radio: RadioManager,
  settings: GuildSettingsRepository,
): DiscordCommand {
  return {
    data: new SlashCommandBuilder()
      .setName('radio')
      .setDescription('Controla a Radio Connect Music 24/7')
      .setContexts(InteractionContextType.Guild)
      .addSubcommand((subcommand) =>
        subcommand
          .setName('tocar')
          .setDescription('Toca uma estação no canal 24/7 configurado')
          .addStringOption((option) =>
            option
              .setName('estacao')
              .setDescription('Nome da estação')
              .setRequired(true)
              .setAutocomplete(true),
          ),
      )
      .addSubcommand((subcommand) =>
        subcommand.setName('parar').setDescription('Para o áudio e mantém a rádio no canal 24/7'),
      )
      .addSubcommand((subcommand) =>
        subcommand.setName('agora').setDescription('Mostra a estação em reprodução'),
      )
      .addSubcommand((subcommand) =>
        subcommand.setName('status').setDescription('Mostra o diagnóstico da transmissão'),
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('listar')
          .setDescription('Lista as estações disponíveis')
          .addStringOption((option) =>
            option
              .setName('genero')
              .setDescription('Filtra por gênero musical')
              .setAutocomplete(true),
          ),
      ),

    async execute({ interaction }) {
      if (!interaction.guildId || !interaction.inGuild() || !interaction.guild) {
        await interaction.reply({
          content: 'Use este comando em um servidor.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const subcommand = interaction.options.getSubcommand();
      if (subcommand === 'tocar' || subcommand === 'parar') {
        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        if (
          !canControlRadio(interaction.memberPermissions, member, settings.get(interaction.guildId))
        ) {
          await interaction.reply({
            content:
              'Você não tem permissão para controlar a rádio. Peça a um administrador um cargo autorizado em `/config` → **Permissões**.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
      }

      if (subcommand === 'tocar') {
        const stationId = interaction.options.getString('estacao', true);
        const station = catalog.getById(stationId);
        if (!station) {
          await interaction.reply({
            content: 'Estação não encontrada.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        const configured = settings.get(interaction.guildId);
        if (!configured) {
          await interaction.reply({
            content: 'O canal 24/7 ainda não foi definido. Um administrador deve usar `/config`.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        await interaction.deferReply();
        const channel = await interaction.guild.channels.fetch(configured.voiceChannelId);
        if (channel?.type !== ChannelType.GuildVoice) {
          await interaction.editReply({
            content: 'O canal configurado não existe mais. Use `/config` para escolher outro.',
          });
          return;
        }
        const botMember = interaction.guild.members.me;
        const permissions = botMember ? channel.permissionsFor(botMember) : undefined;
        if (!permissions?.has([PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) {
          await interaction.editReply({
            content: 'Preciso das permissões **Conectar** e **Falar** nesse canal.',
          });
          return;
        }

        const fallbackStation = configured.fallbackStationId
          ? catalog.getById(configured.fallbackStationId)
          : undefined;
        await radio.play(channel, station, fallbackStation);
        try {
          settings.setStation(interaction.guildId, station.id);
        } catch (error) {
          radio.stop(interaction.guildId);
          throw error;
        }
        await interaction.editReply({
          content: `Transmitindo em <#${channel.id}>.`,
          embeds: [stationEmbed(station)],
        });
        return;
      }

      if (subcommand === 'listar') {
        const genre = interaction.options.getString('genero') ?? undefined;
        const stations = catalog.list(genre);
        const description = stations.length
          ? stations
              .slice(0, 25)
              .map((station) => `• **${station.name}** — ${station.genres.join(', ')}`)
              .join('\n')
          : 'Nenhuma estação foi cadastrada para esse filtro.';
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(brandColor)
              .setTitle(genre ? `Estações: ${genre}` : 'Estações disponíveis')
              .setDescription(description)
              .setFooter({ text: config.branding.name }),
          ],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (subcommand === 'status') {
        const status = radio.getStatus(interaction.guildId);
        const configured = settings.get(interaction.guildId);
        const channelId = status?.channelId ?? configured?.voiceChannelId;
        const isHealthy =
          status?.voiceStatus === VoiceConnectionStatus.Ready &&
          status.audioStatus === AudioPlayerStatus.Playing &&
          status.transcoderActive;
        const isRecovering = Boolean(status?.station) && !isHealthy;
        const color = !status?.station ? 0x64748b : isHealthy ? 0x22c55e : 0xf59e0b;
        const embed = new EmbedBuilder()
          .setColor(color)
          .setTitle('Diagnóstico da Radio Connect Music 24/7')
          .setDescription(
            !status?.station
              ? 'Nenhuma estação está em reprodução neste servidor.'
              : isHealthy
                ? 'A transmissão está saudável e ativa.'
                : isRecovering
                  ? 'A transmissão está se conectando ou se recuperando.'
                  : 'A transmissão precisa de atenção.',
          )
          .addFields(
            {
              name: 'Estado geral',
              value: status?.station
                ? isHealthy
                  ? `${customEmojis.green} Saudável`
                  : `${customEmojis.yellow} Em recuperação`
                : `${customEmojis.white} Parada`,
              inline: true,
            },
            {
              name: 'Conexão de voz',
              value: status ? voiceStatusLabel(status.voiceStatus) : 'Não inicializada',
              inline: true,
            },
            {
              name: 'Áudio',
              value: status ? audioStatusLabel(status.audioStatus) : 'Parado',
              inline: true,
            },
            {
              name: 'Canal configurado',
              value: channelId ? `<#${channelId}>` : 'Nenhum — use `/config`',
              inline: true,
            },
            {
              name: 'Estação atual',
              value: status?.station
                ? `${status.station.name}\n\`${status.station.id}\``
                : 'Nenhuma',
              inline: true,
            },
            {
              name: 'Transcodificador',
              value: status?.transcoderActive
                ? `${customEmojis.green} FFmpeg ativo`
                : `${customEmojis.white} Inativo`,
              inline: true,
            },
            {
              name: 'Tempo de reprodução',
              value: status?.playbackStartedAt
                ? `<t:${String(Math.floor(status.playbackStartedAt / 1000))}:R>`
                : '—',
              inline: true,
            },
            {
              name: 'Recuperações',
              value: `Áudio: **${String(status?.reconnectAttempts ?? 0)}**\nVoz: **${String(status?.voiceReconnectAttempts ?? 0)}**`,
              inline: true,
            },
            {
              name: 'Último erro',
              value: status?.lastError
                ? `${status.lastError.message}\n<t:${String(Math.floor(status.lastError.at / 1000))}:R>`
                : 'Nenhum erro registrado',
              inline: false,
            },
          )
          .setFooter({ text: `${config.branding.name} • diagnóstico operacional` })
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
        return;
      }

      const snapshot = radio.get(interaction.guildId);
      if (subcommand === 'agora') {
        await interaction.reply(
          snapshot
            ? { embeds: [stationEmbed(snapshot.station)] }
            : {
                content: 'A rádio não está tocando neste servidor.',
                flags: MessageFlags.Ephemeral,
              },
        );
        return;
      }

      if (!snapshot) {
        await interaction.reply({
          content: 'A rádio não está tocando neste servidor.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const memberChannelId = (interaction.member as GuildMember).voice.channelId;
      if (memberChannelId !== snapshot.channelId) {
        await interaction.reply({
          content: 'Entre no mesmo canal de voz da rádio para controlá-la.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      radio.stop(interaction.guildId);
      settings.clearStation(interaction.guildId);
      await interaction.reply(`${customEmojis.close} Transmissão encerrada.`);
    },

    async autocomplete(interaction) {
      const focused = interaction.options.getFocused(true);
      if (focused.name === 'estacao') {
        const stations = catalog.search(focused.value);
        await interaction.respond(
          stations.map((station) => ({ name: station.name, value: station.id })),
        );
        return;
      }
      const term = focused.value.toLocaleLowerCase('pt-BR');
      await interaction.respond(
        catalog
          .genres()
          .filter((genre) => genre.toLocaleLowerCase('pt-BR').includes(term))
          .slice(0, 25)
          .map((genre) => ({ name: genre, value: genre })),
      );
    },
  };
}

function voiceStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    ready: `${customEmojis.green} Pronta`,
    connecting: `${customEmojis.yellow} Conectando`,
    signalling: `${customEmojis.blue} Negociando`,
    disconnected: `${customEmojis.yellow} Desconectada`,
    destroyed: `${customEmojis.red} Encerrada`,
  };
  return labels[status] ?? `${customEmojis.white} ${status}`;
}

function audioStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    playing: `${customEmojis.green} Tocando`,
    buffering: `${customEmojis.yellow} Carregando`,
    idle: `${customEmojis.white} Parado`,
    autopaused: `${customEmojis.yellow} Pausado`,
  };
  return labels[status] ?? `${customEmojis.white} ${status}`;
}
