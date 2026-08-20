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
  RoleSelectMenuBuilder,
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
import { canManageConfiguration } from '../permissions.js';
import { customEmojis } from '../custom-emojis.js';

const CUSTOM_ID_PREFIX = 'config:';
const VOICE_CHANNEL_ID = `${CUSTOM_ID_PREFIX}voice-channel`;
const DEFAULT_STATION_ID = `${CUSTOM_ID_PREFIX}station-default`;
const FALLBACK_STATION_ID = `${CUSTOM_ID_PREFIX}station-fallback`;
const CLEAR_FALLBACK_ID = `${CUSTOM_ID_PREFIX}station-fallback-clear`;
const PERMISSIONS_ID = `${CUSTOM_ID_PREFIX}permissions`;
const PERMISSIONS_BACK_ID = `${CUSTOM_ID_PREFIX}permissions-back`;
const CONTROL_ROLE_ID = `${CUSTOM_ID_PREFIX}permissions-control-role`;
const CONFIG_ROLE_ID = `${CUSTOM_ID_PREFIX}permissions-config-role`;
const CLEAR_CONTROL_ROLES_ID = `${CUSTOM_ID_PREFIX}permissions-control-clear`;
const CLEAR_CONFIG_ROLES_ID = `${CUSTOM_ID_PREFIX}permissions-config-clear`;
const PUBLIC_CONTROL_ID = `${CUSTOM_ID_PREFIX}permissions-public-toggle`;
const MESSAGES_ID = `${CUSTOM_ID_PREFIX}messages`;
const MESSAGES_BACK_ID = `${CUSTOM_ID_PREFIX}messages-back`;
const ANNOUNCEMENT_CHANNEL_ID = `${CUSTOM_ID_PREFIX}messages-channel`;
const CLEAR_ANNOUNCEMENT_CHANNEL_ID = `${CUSTOM_ID_PREFIX}messages-channel-clear`;
const TEST_ANNOUNCEMENT_ID = `${CUSTOM_ID_PREFIX}messages-test`;
const MESSAGE_TOGGLE_PREFIX = `${CUSTOM_ID_PREFIX}messages-toggle:`;
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
        .setContexts(InteractionContextType.Guild),

      async execute({ interaction }) {
        if (!interaction.inGuild() || !interaction.guild) {
          await interaction.reply({
            content: 'Use este comando em um servidor.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        if (
          !canManageConfiguration(
            interaction.memberPermissions,
            member,
            settings.get(interaction.guild.id),
          )
        ) {
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
        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        if (
          !canManageConfiguration(
            interaction.memberPermissions,
            member,
            settings.get(interaction.guild.id),
          )
        ) {
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

        if (interaction.customId === PERMISSIONS_ID) {
          await interaction.update(buildPermissionsPanel(interaction.guild, settings));
          return;
        }

        if (interaction.customId === MESSAGES_ID) {
          await interaction.update(buildMessagesPanel(interaction.guild, settings));
          return;
        }

        if (interaction.customId === MESSAGES_BACK_ID) {
          await interaction.update(buildPanel(interaction.guild, settings, radio, catalog));
          return;
        }

        if (interaction.customId === CLEAR_ANNOUNCEMENT_CHANNEL_ID) {
          await interaction.deferUpdate();
          settings.clearAnnouncementChannel(interaction.guild.id);
          await interaction.editReply(buildMessagesPanel(interaction.guild, settings));
          return;
        }

        if (interaction.customId === TEST_ANNOUNCEMENT_ID) {
          const saved = settings.get(interaction.guild.id);
          if (!saved?.announcementChannelId) {
            await interaction.reply({ content: 'Configure primeiro um canal de notificações.', flags: MessageFlags.Ephemeral });
            return;
          }
          const channel = await interaction.guild.channels.fetch(saved.announcementChannelId).catch(() => null);
          if (!channel?.isTextBased() || !('send' in channel)) {
            await interaction.reply({ content: 'O canal salvo não está mais disponível. Escolha outro canal.', flags: MessageFlags.Ephemeral });
            return;
          }
          try {
            await channel.send({
              embeds: [new EmbedBuilder().setColor(brandColor).setTitle(`${customEmojis.mail} Notificações configuradas`).setDescription('Este é um teste da interface da **Radio Connect Music 24/7**. O canal está pronto para receber os eventos selecionados.').addFields({ name: `${customEmojis.green} Status`, value: 'Canal validado com sucesso.', inline: true }, { name: `${customEmojis.info} Modo`, value: saved.quietMode ? 'Silencioso' : 'Ativo', inline: true }).setFooter({ text: 'Mensagem de teste • nenhuma transmissão foi alterada' }).setTimestamp()],
              allowedMentions: { parse: [] },
            });
            await interaction.reply({ content: `${customEmojis.green} Mensagem de teste enviada em <#${channel.id}>.`, flags: MessageFlags.Ephemeral });
          } catch {
            await interaction.reply({ content: `${customEmojis.red} Não consegui enviar nesse canal. Verifique minhas permissões.`, flags: MessageFlags.Ephemeral });
          }
          return;
        }

        if (interaction.customId.startsWith(MESSAGE_TOGGLE_PREFIX)) {
          await interaction.deferUpdate();
          const preference = interaction.customId.slice(MESSAGE_TOGGLE_PREFIX.length) as
            | 'announcePlayback'
            | 'announceRecovery'
            | 'announceFallback'
            | 'quietMode'
            | 'liveStatusEnabled';
          const saved = settings.get(interaction.guild.id);
          settings.setMessagePreference(interaction.guild.id, preference, !saved?.[preference]);
          await interaction.editReply(buildMessagesPanel(interaction.guild, settings));
          return;
        }

        if (interaction.customId === PERMISSIONS_BACK_ID) {
          await interaction.update(buildPanel(interaction.guild, settings, radio, catalog));
          return;
        }

        if (interaction.customId === PUBLIC_CONTROL_ID) {
          await interaction.deferUpdate();
          const saved = settings.get(interaction.guild.id);
          settings.setPublicControlEnabled(interaction.guild.id, !saved?.publicControlEnabled);
          await interaction.editReply(buildPermissionsPanel(interaction.guild, settings));
          return;
        }

        if (
          interaction.customId === CLEAR_CONTROL_ROLES_ID ||
          interaction.customId === CLEAR_CONFIG_ROLES_ID
        ) {
          await interaction.deferUpdate();
          if (interaction.customId === CLEAR_CONTROL_ROLES_ID) {
            settings.setControlRoles(interaction.guild.id, []);
          } else {
            settings.setConfigRoles(interaction.guild.id, []);
          }
          await interaction.editReply(buildPermissionsPanel(interaction.guild, settings));
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
            content: `${customEmojis.green} Canal de voz removido. A rádio não se conectará automaticamente neste servidor.`,
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

        if (interaction.customId === ANNOUNCEMENT_CHANNEL_ID && interaction.isChannelSelectMenu()) {
          const channelId = interaction.values[0];
          const channel = channelId ? await interaction.guild.channels.fetch(channelId) : null;
          if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
            await interaction.reply({ content: 'Escolha um canal de texto válido.', flags: MessageFlags.Ephemeral });
            return;
          }
          const permissions = interaction.guild.members.me ? channel.permissionsFor(interaction.guild.members.me) : undefined;
          if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
            await interaction.reply({ content: 'Preciso de **Ver canal**, **Enviar mensagens** e **Inserir links** nesse canal.', flags: MessageFlags.Ephemeral });
            return;
          }
          await interaction.deferUpdate();
          settings.setAnnouncementChannel(interaction.guild.id, channel.id);
          await interaction.editReply(buildMessagesPanel(interaction.guild, settings));
          return;
        }

        if (interaction.customId === CONTROL_ROLE_ID && interaction.isRoleSelectMenu()) {
          await savePermissionRole(interaction, settings, 'control');
          return;
        }

        if (interaction.customId === CONFIG_ROLE_ID && interaction.isRoleSelectMenu()) {
          await savePermissionRole(interaction, settings, 'config');
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
    ? `${customEmojis.green} Conectada em <#${connectedChannelId}>`
    : saved
      ? `${customEmojis.yellow} Canal salvo, aguardando conexão`
      : `${customEmojis.white} Aguardando configuração`;
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
      ? `${customEmojis.green} Ver, conectar e falar`
      : `${customEmojis.red} Permissões insuficientes`
    : `${customEmojis.white} Aguardando canal`;
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
    .setTitle(`${customEmojis.edit} Central de Configuração`)
    .setDescription(
      `### ${customEmojis.blue} Canal de voz\nConfigure onde a rádio deve permanecer conectada. A seleção é validada antes de ser salva e as alterações valem somente para este servidor.\n\n### ${customEmojis.radio} Estações\nDefina a estação padrão e uma reserva para recuperação operacional.`,
    )
    .addFields(
      { name: `${customEmojis.blue} Canal de voz 24/7`, value: channelValue, inline: true },
      { name: `${customEmojis.info} Estado da conexão`, value: connectionValue, inline: true },
      {
        name: `${customEmojis.music} Transmissão atual`,
        value: playback ? playback.station.name : 'Nenhuma estação em reprodução',
        inline: false,
      },
      {
        name: `${customEmojis.radio} Estação padrão`,
        value: defaultStation ? `${defaultStation.name}\n\`${defaultStation.id}\`` : 'Não definida',
        inline: true,
      },
      {
        name: `${customEmojis.sparkle} Estação reserva`,
        value: fallbackStation
          ? `${fallbackStation.name}\n\`${fallbackStation.id}\``
          : 'Não definida',
        inline: true,
      },
      { name: `${customEmojis.moderator} Permissões do bot`, value: permissionValue, inline: true },
      {
        name: `${customEmojis.members} Ocupação`,
        value: selectedChannel?.isVoiceBased()
          ? `${String(selectedChannel.members.size)} membro(s) conectado(s)`
          : '—',
        inline: true,
      },
      {
        name: `${customEmojis.administrator} Acesso administrativo`,
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
      .setEmoji(customEmojis.close)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(MESSAGES_ID)
      .setLabel('Mensagens')
      .setEmoji(customEmojis.mail)
      .setStyle(ButtonStyle.Primary),
  );
  const cleanupRow = new ActionRowBuilder<ButtonBuilder>();
  if (fallbackStation) {
    cleanupRow.addComponents(
      new ButtonBuilder()
        .setCustomId(CLEAR_FALLBACK_ID)
        .setLabel('Remover reserva')
        .setEmoji(customEmojis.trash)
        .setStyle(ButtonStyle.Secondary),
    );
  }
  if (saved) {
    cleanupRow.addComponents(
      new ButtonBuilder()
        .setCustomId(CLEAR_VOICE_ID)
        .setLabel('Remover canal')
        .setEmoji(customEmojis.trash)
        .setStyle(ButtonStyle.Danger),
    );
  }
  actionsRow.addComponents(
    new ButtonBuilder()
      .setCustomId(PERMISSIONS_ID)
      .setLabel('Permissões')
      .setEmoji(customEmojis.moderator)
      .setStyle(ButtonStyle.Primary),
  );

  return {
    embeds: [embed],
    components: [channelRow, defaultStationRow, fallbackStationRow, actionsRow, ...(cleanupRow.components.length ? [cleanupRow] : [])],
  };
}

function buildMessagesPanel(guild: Guild, settings: GuildSettingsRepository) {
  const saved = settings.get(guild.id);
  const channel = saved?.announcementChannelId ? guild.channels.cache.get(saved.announcementChannelId) : undefined;
  const channelValue = channel ? `<#${channel.id}>` : `${customEmojis.white} Não configurado`;
  const enabled = (value?: boolean) => value ? customEmojis.green : customEmojis.white;
  const toggle = (id: string, label: string, value?: boolean) => new ButtonBuilder()
    .setCustomId(`${MESSAGE_TOGGLE_PREFIX}${id}`)
    .setLabel(`${value ? 'Ativo' : 'Desativado'} · ${label}`)
    .setEmoji(enabled(value))
    .setStyle(value ? ButtonStyle.Success : ButtonStyle.Secondary);
  const select = new ChannelSelectMenuBuilder()
    .setCustomId(ANNOUNCEMENT_CHANNEL_ID)
    .setPlaceholder('Escolha o canal das notificações')
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1);
  if (saved?.announcementChannelId) select.setDefaultChannels(saved.announcementChannelId);
  const channelActions = new ActionRowBuilder<ButtonBuilder>();
  channelActions.addComponents(new ButtonBuilder().setCustomId(TEST_ANNOUNCEMENT_ID).setLabel('Enviar teste').setEmoji(customEmojis.mail).setStyle(ButtonStyle.Success));
  if (channel) channelActions.addComponents(new ButtonBuilder().setCustomId(CLEAR_ANNOUNCEMENT_CHANNEL_ID).setLabel('Remover canal').setEmoji(customEmojis.trash).setStyle(ButtonStyle.Danger));
  channelActions.addComponents(new ButtonBuilder().setCustomId(MESSAGES_BACK_ID).setLabel('Voltar ao painel').setEmoji('↩️').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(CLOSE_ID).setLabel('Fechar painel').setEmoji(customEmojis.close).setStyle(ButtonStyle.Secondary));
  return {
    embeds: [new EmbedBuilder()
      .setColor(brandColor)
      .setTitle(`${customEmojis.mail} Mensagens e interface`)
      .setDescription('Defina como a Radio Connect Music informa eventos no servidor. Tudo é salvo automaticamente por servidor.')
      .addFields(
        { name: `${customEmojis.mail} Canal de notificações`, value: channelValue, inline: false },
        { name: `${customEmojis.music} Início da transmissão`, value: `${enabled(saved?.announcePlayback)} Avisar quando uma estação começar`, inline: false },
        { name: `${customEmojis.audacity} Recuperação`, value: `${enabled(saved?.announceRecovery)} Avisar quando a conexão for recuperada`, inline: false },
        { name: `${customEmojis.sparkle} Estação reserva`, value: `${enabled(saved?.announceFallback)} Avisar quando o fallback for acionado`, inline: false },
        { name: `${customEmojis.info} Modo silencioso`, value: `${enabled(saved?.quietMode)} Ocultar notificações automáticas (comandos continuam respondendo)`, inline: false },
        { name: `${customEmojis.statistics} Painel ao vivo`, value: `${enabled(saved?.liveStatusEnabled)} Manter uma única mensagem com o estado atual da rádio`, inline: false },
      ).setFooter({ text: 'O bot valida permissões antes de salvar o canal.' }).setTimestamp()],
    components: [new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(select), new ActionRowBuilder<ButtonBuilder>().addComponents(toggle('announcePlayback', 'Início', saved?.announcePlayback), toggle('announceRecovery', 'Recuperação', saved?.announceRecovery)), new ActionRowBuilder<ButtonBuilder>().addComponents(toggle('announceFallback', 'Fallback', saved?.announceFallback), toggle('quietMode', 'Silencioso', saved?.quietMode)), new ActionRowBuilder<ButtonBuilder>().addComponents(toggle('liveStatusEnabled', 'Painel ao vivo', saved?.liveStatusEnabled)), channelActions],
  };
}

function buildPermissionsPanel(guild: Guild, settings: GuildSettingsRepository) {
  const saved = settings.get(guild.id);
  const controlRoles = (saved?.controlRoleIds ?? [])
    .map((roleId) => guild.roles.cache.get(roleId))
    .filter((role): role is NonNullable<typeof role> => Boolean(role));
  const configRoles = (saved?.configRoleIds ?? [])
    .map((roleId) => guild.roles.cache.get(roleId))
    .filter((role): role is NonNullable<typeof role> => Boolean(role));
  const roleText = (roles: readonly { id: string }[]) =>
    roles.length ? roles.map((role) => `<@&${role.id}>`).join(', ') : 'Nenhum cargo configurado';
  const controlSelect = new RoleSelectMenuBuilder()
    .setCustomId(CONTROL_ROLE_ID)
    .setPlaceholder('Adicionar cargo de controle da rádio')
    .setMinValues(1)
    .setMaxValues(1);
  const configSelect = new RoleSelectMenuBuilder()
    .setCustomId(CONFIG_ROLE_ID)
    .setPlaceholder('Adicionar cargo de configuração')
    .setMinValues(1)
    .setMaxValues(1);
  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(PUBLIC_CONTROL_ID)
      .setLabel(
        saved?.publicControlEnabled ? 'Controle público: ativo' : 'Controle público: desativado',
      )
      .setEmoji(saved?.publicControlEnabled ? customEmojis.green : customEmojis.white)
      .setStyle(saved?.publicControlEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(CLEAR_CONTROL_ROLES_ID)
      .setLabel('Limpar controle')
      .setEmoji(customEmojis.trash)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(CLEAR_CONFIG_ROLES_ID)
      .setLabel('Limpar configuração')
      .setEmoji(customEmojis.trash)
      .setStyle(ButtonStyle.Secondary),
  );
  const navigationRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(PERMISSIONS_BACK_ID)
      .setLabel('Voltar ao painel')
      .setEmoji('↩️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(CLOSE_ID)
      .setLabel('Fechar painel')
      .setEmoji(customEmojis.close)
      .setStyle(ButtonStyle.Secondary),
  );
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0x2563eb)
        .setTitle(`${customEmojis.moderator} Central de Permissões`)
        .setDescription(
          'Controle o acesso por cargos sem expor funções administrativas. Administradores e membros com **Gerenciar Servidor** sempre mantêm acesso total.',
        )
        .addFields(
          {
            name: `${customEmojis.staff} Cargos de controle`,
            value: `${roleText(controlRoles)}\n\nPodem tocar, parar e trocar a estação.`,
            inline: false,
          },
          {
            name: `${customEmojis.edit} Cargos de configuração`,
            value: `${roleText(configRoles)}\n\nPodem abrir e alterar este painel.`,
            inline: false,
          },
          {
            name: `${customEmojis.web} Controle público`,
            value: saved?.publicControlEnabled
              ? `${customEmojis.green} Qualquer membro pode controlar a rádio.`
              : `${customEmojis.white} Desativado. Somente administradores e cargos autorizados controlam a rádio.`,
            inline: false,
          },
        )
        .setFooter({ text: 'Cargos gerenciados são salvos somente neste servidor.' })
        .setTimestamp(),
    ],
    components: [
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(controlSelect),
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(configSelect),
      actionRow,
      navigationRow,
    ],
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
      .setEmoji(customEmojis.trash)
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
        .setTitle(`${customEmojis.trash} Remover canal de voz?`)
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

async function savePermissionRole(
  interaction: MessageComponentInteraction,
  settings: GuildSettingsRepository,
  scope: 'control' | 'config',
): Promise<void> {
  if (!interaction.isRoleSelectMenu() || !interaction.guild) return;
  const roleId = interaction.values[0];
  const role = roleId ? interaction.guild.roles.cache.get(roleId) : undefined;
  const current = settings.get(interaction.guild.id);
  if (!role || role.id === interaction.guild.id || role.managed) {
    await interaction.reply({
      content: 'Esse cargo é gerenciado pelo Discord e não pode ser usado aqui.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!current) {
    await interaction.reply({
      content: 'Configure o canal de voz antes de alterar permissões.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const currentIds =
    scope === 'control' ? (current.controlRoleIds ?? []) : (current.configRoleIds ?? []);
  if (currentIds.includes(role.id)) {
    await interaction.reply({
      content: 'Esse cargo já está autorizado.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (currentIds.length >= 10) {
    await interaction.reply({
      content: 'Limite de 10 cargos atingido. Remova um cargo antes de adicionar outro.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.deferUpdate();
  const nextIds = [...currentIds, role.id];
  if (scope === 'control') settings.setControlRoles(interaction.guild.id, nextIds);
  else settings.setConfigRoles(interaction.guild.id, nextIds);
  await interaction.editReply(buildPermissionsPanel(interaction.guild, settings));
}
