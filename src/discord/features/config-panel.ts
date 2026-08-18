import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  SlashCommandBuilder,
  type Guild,
  type MessageComponentInteraction,
  type VoiceBasedChannel,
} from 'discord.js';

import { config } from '../../config/index.js';
import type { RadioManager } from '../../radio/radio-manager.js';
import type { StationCatalog } from '../../radio/station-catalog.js';
import type { GuildSettingsRepository } from '../../settings/guild-settings.js';
import type { DiscordCommand } from '../command.js';
import type { ComponentHandler } from '../component.js';
import { brandColor } from '../embeds.js';

const CUSTOM_ID_PREFIX = 'config:';
const VOICE_CHANNEL_ID = `${CUSTOM_ID_PREFIX}voice-channel`;
const DEFAULT_STATION_ID = `${CUSTOM_ID_PREFIX}station-default`;
const FALLBACK_STATION_ID = `${CUSTOM_ID_PREFIX}station-fallback`;
const CLEAR_FALLBACK_ID = `${CUSTOM_ID_PREFIX}station-fallback-clear`;
const CLEAR_VOICE_ID = `${CUSTOM_ID_PREFIX}voice-clear`;
const CLEAR_VOICE_CONFIRM_ID = `${CUSTOM_ID_PREFIX}voice-clear-confirm`;
const CLEAR_VOICE_CANCEL_ID = `${CUSTOM_ID_PREFIX}voice-clear-cancel`;
const REFRESH_ID = `${CUSTOM_ID_PREFIX}refresh`;
const CLOSE_ID = `${CUSTOM_ID_PREFIX}close`;

export interface ConfigPanelFeature {
  command: DiscordCommand;
  componentHandler: ComponentHandler;
}

export function createConfigPanelFeature(
  settings: GuildSettingsRepository,
  radio: RadioManager,
  catalog: StationCatalog,
): ConfigPanelFeature {
  return {
    command: {
      data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('Abre a central administrativa da rádio')
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

      async execute({ interaction }) {
        if (!interaction.inGuild() || !interaction.guild) {
          await interaction.reply({
            content: 'Use este comando em um servidor.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        if (!canManageGuild(interaction.memberPermissions)) {
          await interaction.reply({
            content: 'Você precisa da permissão **Gerenciar Servidor** para abrir este painel.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        await interaction.reply({
          ...buildPanel(interaction.guild, settings, radio, catalog),
          flags: MessageFlags.Ephemeral,
        });
      },
    },

    componentHandler: {
      canHandle: (customId) => customId.startsWith(CUSTOM_ID_PREFIX),

      async execute(interaction) {
        if (!interaction.inGuild() || !interaction.guild) return;
        if (!canManageGuild(interaction.memberPermissions)) {
          await interaction.reply({
            content: 'Você não tem permissão para alterar esta configuração.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (interaction.customId === CLOSE_ID) {
          await interaction.update({
            content: 'Central de configuração fechada.',
            embeds: [],
            components: [],
          });
          return;
        }

        if (interaction.customId === REFRESH_ID) {
          await interaction.update(buildPanel(interaction.guild, settings, radio, catalog));
          return;
        }

        if (interaction.customId === CLEAR_VOICE_ID) {
          const saved = settings.get(interaction.guild.id);
          await interaction.update(buildClearVoiceConfirmation(saved?.voiceChannelId));
          return;
        }

        if (interaction.customId === CLEAR_VOICE_CANCEL_ID) {
          await interaction.update(buildPanel(interaction.guild, settings, radio, catalog));
          return;
        }

        if (interaction.customId === CLEAR_VOICE_CONFIRM_ID) {
          await interaction.deferUpdate();
          radio.stop(interaction.guild.id);
          radio.disconnect(interaction.guild.id);
          settings.clearVoiceChannel(interaction.guild.id);
          await interaction.editReply({
            content:
              '✅ Canal de voz removido. A rádio não se conectará automaticamente neste servidor.',
            ...buildPanel(interaction.guild, settings, radio, catalog),
          });
          return;
        }

        if (interaction.customId === VOICE_CHANNEL_ID && interaction.isChannelSelectMenu()) {
          await saveVoiceChannel(interaction, settings, radio, catalog);
          return;
        }

        if (interaction.customId === DEFAULT_STATION_ID && interaction.isStringSelectMenu()) {
          await saveDefaultStation(interaction, settings, radio, catalog);
          return;
        }

        if (interaction.customId === FALLBACK_STATION_ID && interaction.isStringSelectMenu()) {
          await saveFallbackStation(interaction, settings, radio, catalog);
          return;
        }

        if (interaction.customId === CLEAR_FALLBACK_ID) {
          await interaction.deferUpdate();
          settings.clearFallbackStation(interaction.guild.id);
          await interaction.editReply(buildPanel(interaction.guild, settings, radio, catalog));
        }
      },
    },
  };
}

function buildPanel(
  guild: Guild,
  settings: GuildSettingsRepository,
  radio: RadioManager,
  catalog: StationCatalog,
) {
  const saved = settings.get(guild.id);
  const connectedChannelId = radio.getChannelId(guild.id);
  const playback = radio.get(guild.id);
  const channelValue = saved ? `<#${saved.voiceChannelId}>` : '`Não configurado`';
  const connectionValue = connectedChannelId
    ? `🟢 Conectada em <#${connectedChannelId}>`
    : saved
      ? '🟡 Canal salvo, aguardando conexão'
      : '⚪ Aguardando configuração';
  const selectedChannel = saved ? guild.channels.cache.get(saved.voiceChannelId) : undefined;
  const botMember = guild.members.me;
  const permissions =
    selectedChannel?.isVoiceBased() && botMember
      ? selectedChannel.permissionsFor(botMember)
      : undefined;
  const permissionValue = saved
    ? permissions?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak,
      ])
      ? '🟢 Ver, conectar e falar'
      : '🔴 Permissões insuficientes'
    : '⚪ Aguardando canal';
  const defaultStationId = saved?.defaultStationId ?? saved?.stationId;
  const defaultStation = defaultStationId ? catalog.getById(defaultStationId) : undefined;
  const fallbackStation = saved?.fallbackStationId
    ? catalog.getById(saved.fallbackStationId)
    : undefined;

  const guildIcon = guild.iconURL();
  const embed = new EmbedBuilder()
    .setColor(brandColor)
    .setAuthor(
      guildIcon
        ? { name: config.branding.name, iconURL: guildIcon }
        : { name: config.branding.name },
    )
    .setTitle('⚙️ Central de Configuração')
    .setDescription(
      '### 🔊 Canal de voz\nConfigure onde a rádio deve permanecer conectada. A seleção é validada antes de ser salva e as alterações valem somente para este servidor.\n\n### 📻 Estações\nDefina a estação padrão e uma reserva para recuperação operacional.',
    )
    .addFields(
      { name: '🔊 Canal de voz 24/7', value: channelValue, inline: true },
      { name: '📡 Estado da conexão', value: connectionValue, inline: true },
      {
        name: '🎵 Transmissão atual',
        value: playback ? playback.station.name : 'Nenhuma estação em reprodução',
        inline: false,
      },
      {
        name: '📻 Estação padrão',
        value: defaultStation ? `${defaultStation.name}\n\`${defaultStation.id}\`` : 'Não definida',
        inline: true,
      },
      {
        name: '🛟 Estação reserva',
        value: fallbackStation
          ? `${fallbackStation.name}\n\`${fallbackStation.id}\``
          : 'Não definida',
        inline: true,
      },
      { name: '🛡️ Permissões do bot', value: permissionValue, inline: true },
      {
        name: '👥 Ocupação',
        value: selectedChannel?.isVoiceBased()
          ? `${String(selectedChannel.members.size)} membro(s) conectado(s)`
          : '—',
        inline: true,
      },
      {
        name: '🔐 Acesso administrativo',
        value: 'Protegido por **Gerenciar Servidor** ou **Administrador**.',
        inline: false,
      },
    )
    .setFooter({ text: 'As alterações são salvas automaticamente por servidor.' })
    .setTimestamp();

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(VOICE_CHANNEL_ID)
    .setPlaceholder('Escolha o canal de voz permanente')
    .setChannelTypes(ChannelType.GuildVoice)
    .setMinValues(1)
    .setMaxValues(1);
  if (saved) channelSelect.setDefaultChannels(saved.voiceChannelId);

  const channelRow = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(channelSelect);
  const defaultStationSelect = new StringSelectMenuBuilder()
    .setCustomId(DEFAULT_STATION_ID)
    .setPlaceholder('Escolha a estação padrão')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(stationOptions(catalog, defaultStationId));
  const fallbackStationSelect = new StringSelectMenuBuilder()
    .setCustomId(FALLBACK_STATION_ID)
    .setPlaceholder('Escolha a estação reserva')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(stationOptions(catalog, saved?.fallbackStationId));
  const defaultStationRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    defaultStationSelect,
  );
  const fallbackStationRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    fallbackStationSelect,
  );
  const actionsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(REFRESH_ID)
      .setLabel('Atualizar estado')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(CLOSE_ID)
      .setLabel('Fechar painel')
      .setEmoji('✖️')
      .setStyle(ButtonStyle.Secondary),
  );
  if (fallbackStation) {
    actionsRow.addComponents(
      new ButtonBuilder()
        .setCustomId(CLEAR_FALLBACK_ID)
        .setLabel('Remover reserva')
        .setEmoji('🧹')
        .setStyle(ButtonStyle.Secondary),
    );
  }
  if (saved) {
    actionsRow.addComponents(
      new ButtonBuilder()
        .setCustomId(CLEAR_VOICE_ID)
        .setLabel('Remover canal')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger),
    );
  }

  return {
    embeds: [embed],
    components: [channelRow, defaultStationRow, fallbackStationRow, actionsRow],
  };
}

function stationOptions(catalog: StationCatalog, selectedId?: string) {
  return catalog
    .list()
    .slice(0, 25)
    .map((station) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(station.name.slice(0, 100))
        .setValue(station.id)
        .setDescription(station.genres.join(' • ').slice(0, 100))
        .setDefault(station.id === selectedId),
    );
}

function buildClearVoiceConfirmation(channelId?: string) {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(CLEAR_VOICE_CONFIRM_ID)
      .setLabel('Confirmar remoção')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(CLEAR_VOICE_CANCEL_ID)
      .setLabel('Cancelar')
      .setEmoji('↩️')
      .setStyle(ButtonStyle.Secondary),
  );
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0xef4444)
        .setTitle('⚠️ Remover canal de voz?')
        .setDescription(
          `Isso desconectará a rádio de ${channelId ? `<#${channelId}>` : 'o canal configurado'} e desativará a conexão automática neste servidor.`,
        )
        .setFooter({ text: 'A estação salva também deixará de ser restaurada automaticamente.' }),
    ],
    components: [row],
  };
}

async function saveVoiceChannel(
  interaction: MessageComponentInteraction,
  settings: GuildSettingsRepository,
  radio: RadioManager,
  catalog: StationCatalog,
): Promise<void> {
  if (!interaction.isChannelSelectMenu() || !interaction.guild) return;
  const channelId = interaction.values[0];
  if (!channelId) return;
  await interaction.deferUpdate();
  const channel = await interaction.guild.channels.fetch(channelId);
  if (channel?.type !== ChannelType.GuildVoice) {
    await interaction.editReply({
      content: 'Esse canal de voz não está disponível.',
      embeds: [],
      components: [],
    });
    return;
  }
  const voiceChannel = channel as VoiceBasedChannel;
  const botMember = interaction.guild.members.me;
  const permissions = botMember ? voiceChannel.permissionsFor(botMember) : undefined;
  if (
    !permissions?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.Speak,
    ])
  ) {
    await interaction.editReply({
      content: 'Preciso das permissões **Ver canal**, **Conectar** e **Falar** nesse canal.',
      embeds: [],
      components: [],
    });
    return;
  }

  await radio.connect(voiceChannel);
  settings.setVoiceChannel(interaction.guild.id, voiceChannel.id);
  await interaction.editReply(buildPanel(interaction.guild, settings, radio, catalog));
}

async function saveDefaultStation(
  interaction: MessageComponentInteraction,
  settings: GuildSettingsRepository,
  radio: RadioManager,
  catalog: StationCatalog,
): Promise<void> {
  if (!interaction.isStringSelectMenu() || !interaction.guild) return;
  const stationId = interaction.values[0];
  const station = stationId ? catalog.getById(stationId) : undefined;
  if (!station) {
    await interaction.reply({
      content: 'Essa estação não está disponível.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const current = settings.get(interaction.guild.id);
  if (current?.fallbackStationId === station.id) {
    await interaction.reply({
      content: 'A estação padrão precisa ser diferente da estação reserva.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!current) {
    await interaction.reply({
      content: 'Configure o canal de voz antes de escolher a estação padrão.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.deferUpdate();
  settings.setDefaultStation(interaction.guild.id, station.id);
  await interaction.editReply(buildPanel(interaction.guild, settings, radio, catalog));
}

async function saveFallbackStation(
  interaction: MessageComponentInteraction,
  settings: GuildSettingsRepository,
  radio: RadioManager,
  catalog: StationCatalog,
): Promise<void> {
  if (!interaction.isStringSelectMenu() || !interaction.guild) return;
  const stationId = interaction.values[0];
  const station = stationId ? catalog.getById(stationId) : undefined;
  const current = settings.get(interaction.guild.id);
  if (!station) {
    await interaction.reply({
      content: 'Essa estação não está disponível.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!current) {
    await interaction.reply({
      content: 'Configure o canal de voz antes de escolher a estação reserva.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if ((current.defaultStationId ?? current.stationId) === station.id) {
    await interaction.reply({
      content: 'A estação reserva precisa ser diferente da estação padrão.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.deferUpdate();
  settings.setFallbackStation(interaction.guild.id, station.id);
  await interaction.editReply(buildPanel(interaction.guild, settings, radio, catalog));
}

function canManageGuild(
  permissions: Readonly<{ has(permission: bigint): boolean }> | null,
): boolean {
  return permissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}
