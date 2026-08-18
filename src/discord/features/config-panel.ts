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
  SlashCommandBuilder,
  type Guild,
  type MessageComponentInteraction,
  type VoiceBasedChannel,
} from 'discord.js';

import { config } from '../../config/index.js';
import type { RadioManager } from '../../radio/radio-manager.js';
import type { GuildSettingsRepository } from '../../settings/guild-settings.js';
import type { DiscordCommand } from '../command.js';
import type { ComponentHandler } from '../component.js';
import { brandColor } from '../embeds.js';

const CUSTOM_ID_PREFIX = 'config:';
const VOICE_CHANNEL_ID = `${CUSTOM_ID_PREFIX}voice-channel`;
const REFRESH_ID = `${CUSTOM_ID_PREFIX}refresh`;
const CLOSE_ID = `${CUSTOM_ID_PREFIX}close`;

export interface ConfigPanelFeature {
  command: DiscordCommand;
  componentHandler: ComponentHandler;
}

export function createConfigPanelFeature(
  settings: GuildSettingsRepository,
  radio: RadioManager,
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
          ...buildPanel(interaction.guild, settings, radio),
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
          await interaction.update(buildPanel(interaction.guild, settings, radio));
          return;
        }

        if (interaction.customId === VOICE_CHANNEL_ID && interaction.isChannelSelectMenu()) {
          await saveVoiceChannel(interaction, settings, radio);
        }
      },
    },
  };
}

function buildPanel(guild: Guild, settings: GuildSettingsRepository, radio: RadioManager) {
  const saved = settings.get(guild.id);
  const connectedChannelId = radio.getChannelId(guild.id);
  const playback = radio.get(guild.id);
  const channelValue = saved ? `<#${saved.voiceChannelId}>` : '`Não configurado`';
  const connectionValue = connectedChannelId
    ? `🟢 Conectada em <#${connectedChannelId}>`
    : saved
      ? '🟡 Canal salvo, aguardando conexão'
      : '⚪ Aguardando configuração';

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
      'Gerencie a rádio deste servidor em um só lugar. Para começar, selecione abaixo o canal de voz onde ela deverá permanecer **24 horas por dia**.',
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

  return { embeds: [embed], components: [channelRow, actionsRow] };
}

async function saveVoiceChannel(
  interaction: MessageComponentInteraction,
  settings: GuildSettingsRepository,
  radio: RadioManager,
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
  await interaction.editReply(buildPanel(interaction.guild, settings, radio));
}

function canManageGuild(
  permissions: Readonly<{ has(permission: bigint): boolean }> | null,
): boolean {
  return permissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}
