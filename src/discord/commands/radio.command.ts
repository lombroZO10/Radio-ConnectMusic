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
import type { StationUsageRepository } from '../../radio/station-usage.js';
import { canControlRadio } from '../permissions.js';
import { customEmojis } from '../custom-emojis.js';

export function createRadioCommand(
  catalog: StationCatalog,
  radio: RadioManager,
  settings: GuildSettingsRepository,
  stationUsage: StationUsageRepository,
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
              .setName('categoria')
              .setDescription('Organiza as estações antes da escolha')
              .setRequired(true)
              .addChoices(
                { name: 'Hunter.FM', value: 'hunter' },
                { name: 'Melhores rádios', value: 'melhores' },
                { name: 'Rádios FM', value: 'fm' },
              ),
          )
          .addStringOption((option) =>
            option
              .setName('estacao')
              .setDescription('Busque por nome, gênero ou ID da estação')
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
        subcommand.setName('melhores').setDescription('Mostra as rádios mais escolhidas pela comunidade'),
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
        const category = interaction.options.getString('categoria', true);
        const stationQuery = interaction.options.getString('estacao', true).trim();
        const station = catalog.getById(stationQuery) ?? catalog.search(stationQuery, 1)[0];
        if (!station) {
          await interaction.reply({
            content: 'Estação não encontrada.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        if (!stationMatchesCategory(station.id, category, catalog)) {
          await interaction.reply({
            content: 'Essa estação não pertence à categoria selecionada. Escolha outra sugestão no autocomplete.',
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
        const currentStatus = radio.getStatus(interaction.guildId);
        if (
          currentStatus?.station?.id === station.id
          && currentStatus.voiceStatus === VoiceConnectionStatus.Ready
          && currentStatus.audioStatus === AudioPlayerStatus.Playing
        ) {
          await interaction.reply({
            content: `${customEmojis.green} **${station.name}** já está transmitindo neste servidor.`,
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
        // O ranking mede seleções concluídas, não apenas buscas no autocomplete.
        try {
          stationUsage.record(station.id);
        } catch {
          // Falha de métrica nunca deve interromper uma transmissão saudável.
        }
        await interaction.editReply({
          content: `${customEmojis.music} **${station.name}** selecionada.\n${customEmojis.green} Transmissão iniciando em <#${channel.id}>.`,
          embeds: [stationEmbed(station)],
        });
        if (configured.liveStatusEnabled) {
          const cleanupTimer = setTimeout(() => {
            void interaction.deleteReply().catch(() => undefined);
          }, 30_000);
          cleanupTimer.unref();
        }
        return;
      }

      if (subcommand === 'listar') {
        const genre = interaction.options.getString('genero') ?? undefined;
        const stations = catalog.list(genre);
        const hunter = stations.filter((station) => station.id.startsWith('hunter-'));
        const partners = stations.filter((station) => !station.id.startsWith('hunter-'));
        const formatStations = (items: typeof stations): string => items.length
          ? items.slice(0, 25).map((station) => `• **${station.name}**\n  ${station.genres.join(' • ')}`).join('\n')
          : 'Nenhuma estação nessa categoria.';
        const embed = new EmbedBuilder()
          .setColor(brandColor)
          .setTitle(genre ? `Estações • ${genre}` : 'Estações disponíveis')
          .setDescription('Escolha uma estação em `/radio tocar`. As estações Hunter.FM ficam separadas das rádios parceiras.')
          .setFooter({ text: config.branding.name });
        embed.addFields(
          { name: `${customEmojis.radio} Hunter.FM`, value: formatStations(hunter), inline: false },
          { name: `${customEmojis.music} Rádios parceiras`, value: formatStations(partners), inline: false },
        );
        await interaction.reply({
          embeds: [embed],
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
                ? `${customEmojis.audacity} FFmpeg ativo`
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

      if (subcommand === 'melhores') {
        const ranked = stationUsage
          .top(catalog.list().map((station) => station.id), 10)
          .filter((entry) => entry.usage.plays > 0);
        const description = ranked.length
          ? ranked
              .map((entry, index) => {
                const station = catalog.getById(entry.stationId);
                if (!station) return undefined;
                return `**${String(index + 1)}. ${station.name}** — ${String(entry.usage.plays)} seleção${entry.usage.plays === 1 ? '' : 'ões'}\n${categoryLabel(station.id)} • ${station.genres.slice(0, 2).join(' • ')}`;
              })
              .filter((line): line is string => Boolean(line))
              .join('\n\n')
          : 'O ranking ainda está sendo formado. Escolha uma estação em `/radio tocar` para começar.';
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(brandColor)
              .setTitle(`${customEmojis.sparkle} Melhores rádios`)
              .setDescription(description)
              .setFooter({ text: `${config.branding.name} • ranking por seleções` })
              .setTimestamp(),
          ],
        });
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
        const category = interaction.options.getString('categoria') ?? 'fm';
        const allowedStations = catalog.list().filter((station) => stationMatchesCategory(station.id, category, catalog));
        const allowedIds = new Set(allowedStations.map((station) => station.id));
        const stations = [...catalog.search(focused.value).filter((station) => allowedIds.has(station.id))];
        const configured = interaction.guildId ? settings.get(interaction.guildId) : undefined;
        const preferredId = configured?.stationId ?? configured?.defaultStationId;
        if (category === 'melhores') {
          const ranking = new Map(
            stationUsage.top(allowedStations.map((station) => station.id), allowedStations.length)
              .map((entry, index) => [entry.stationId, index]),
          );
          stations.sort((a, b) => (ranking.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (ranking.get(b.id) ?? Number.MAX_SAFE_INTEGER));
        }
        if (preferredId) {
          stations.sort((a, b) => Number(b.id === preferredId) - Number(a.id === preferredId));
        }
        await interaction.respond(
          stations.map((station) => ({
            name: `${categoryLabel(station.id)} • ${station.name} • ${station.genres[0] ?? 'Rádio'}`.slice(0, 100),
            value: station.id,
          })),
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

function stationMatchesCategory(
  stationId: string,
  category: string,
  catalog: StationCatalog,
): boolean {
  if (category === 'hunter') return stationId.startsWith('hunter-');
  if (category === 'fm') return !stationId.startsWith('hunter-');
  if (category === 'melhores') {
    // O ranking começa vazio; nesse caso todas ficam disponíveis e vão sendo
    // ordenadas conforme as seleções reais forem registradas.
    return catalog.list().some((station) => station.id === stationId);
  }
  return true;
}

function categoryLabel(stationId: string): string {
  return stationId.startsWith('hunter-') ? 'Hunter.FM' : 'Rádios parceiras';
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
