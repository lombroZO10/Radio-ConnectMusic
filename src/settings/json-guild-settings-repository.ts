import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  guildSettingsFileSchema,
  type GuildSettings,
  type GuildSettingsRepository,
} from './guild-settings.js';
import type { logger as rootLogger } from '../shared/logger.js';

type Logger = typeof rootLogger;

export class JsonGuildSettingsRepository implements GuildSettingsRepository {
  readonly #filePath: string;
  readonly #settings = new Map<string, GuildSettings>();

  constructor(
    filePath = resolve(process.cwd(), 'data', 'guild-settings.json'),
    private readonly logger?: Logger,
  ) {
    this.#filePath = filePath;
    this.#load();
  }

  get(guildId: string): GuildSettings | undefined {
    return this.#settings.get(guildId);
  }

  list(): readonly GuildSettings[] {
    return [...this.#settings.values()];
  }

  setVoiceChannel(guildId: string, voiceChannelId: string): void {
    const current = this.#settings.get(guildId);
    this.#commit(guildId, {
      guildId,
      voiceChannelId,
      ...(current?.stationId ? { stationId: current.stationId } : {}),
      ...(current?.defaultStationId ? { defaultStationId: current.defaultStationId } : {}),
      ...(current?.fallbackStationId ? { fallbackStationId: current.fallbackStationId } : {}),
      ...(current?.controlRoleIds ? { controlRoleIds: current.controlRoleIds } : {}),
      ...(current?.configRoleIds ? { configRoleIds: current.configRoleIds } : {}),
      ...(current?.publicControlEnabled !== undefined
        ? { publicControlEnabled: current.publicControlEnabled }
        : {}),
      ...(current?.announcementChannelId ? { announcementChannelId: current.announcementChannelId } : {}),
      ...(current?.announcePlayback !== undefined ? { announcePlayback: current.announcePlayback } : {}),
      ...(current?.announceRecovery !== undefined ? { announceRecovery: current.announceRecovery } : {}),
      ...(current?.announceFallback !== undefined ? { announceFallback: current.announceFallback } : {}),
      ...(current?.quietMode !== undefined ? { quietMode: current.quietMode } : {}),
    });
  }

  clearVoiceChannel(guildId: string): void {
    const current = this.#settings.get(guildId);
    if (!current) return;
    this.#settings.delete(guildId);
    try {
      this.#save();
    } catch (error) {
      this.#settings.set(guildId, current);
      throw error;
    }
  }

  setDefaultStation(guildId: string, stationId: string): void {
    const current = this.#settings.get(guildId);
    if (!current) throw new Error('Configure o canal de voz antes de salvar a estação padrão.');
    this.#commit(guildId, { ...current, defaultStationId: stationId });
  }

  setFallbackStation(guildId: string, stationId: string): void {
    const current = this.#settings.get(guildId);
    if (!current) throw new Error('Configure o canal de voz antes de salvar a estação reserva.');
    this.#commit(guildId, { ...current, fallbackStationId: stationId });
  }

  clearFallbackStation(guildId: string): void {
    const current = this.#settings.get(guildId);
    if (!current?.fallbackStationId) return;
    this.#commit(guildId, { ...current, fallbackStationId: undefined });
  }

  setControlRoles(guildId: string, roleIds: string[]): void {
    this.#updateWith(guildId, { controlRoleIds: roleIds });
  }

  setConfigRoles(guildId: string, roleIds: string[]): void {
    this.#updateWith(guildId, { configRoleIds: roleIds });
  }

  setPublicControlEnabled(guildId: string, enabled: boolean): void {
    this.#updateWith(guildId, { publicControlEnabled: enabled });
  }

  setAnnouncementChannel(guildId: string, channelId: string): void {
    this.#updateWith(guildId, { announcementChannelId: channelId });
  }

  clearAnnouncementChannel(guildId: string): void {
    const current = this.#settings.get(guildId);
    if (!current?.announcementChannelId) return;
    this.#commit(guildId, { ...current, announcementChannelId: undefined });
  }

  setMessagePreference(guildId: string, preference: 'announcePlayback' | 'announceRecovery' | 'announceFallback' | 'quietMode', enabled: boolean): void {
    this.#updateWith(guildId, { [preference]: enabled });
  }

  setStation(guildId: string, stationId: string): void {
    const current = this.#settings.get(guildId);
    if (!current) throw new Error('Configure o canal de voz antes de salvar a estação.');
    this.#commit(guildId, { ...current, stationId });
  }

  clearStation(guildId: string): void {
    const current = this.#settings.get(guildId);
    if (!current?.stationId) return;
    this.#commit(guildId, { ...current, stationId: undefined });
  }

  #updateWith(guildId: string, patch: Partial<GuildSettings>): void {
    const current = this.#settings.get(guildId);
    if (!current) throw new Error('Configure o canal de voz antes de alterar permissões.');
    this.#commit(guildId, { ...current, ...patch });
  }

  #load(): void {
    if (!existsSync(this.#filePath)) return;
    try {
      const raw: unknown = JSON.parse(readFileSync(this.#filePath, 'utf8'));
      const file = guildSettingsFileSchema.parse(raw);
      for (const settings of file.guilds) this.#settings.set(settings.guildId, settings);
    } catch (error) {
      const backupPath = `${this.#filePath}.corrupt-${String(Date.now())}`;
      try {
        renameSync(this.#filePath, backupPath);
      } catch (backupError) {
        this.logger?.error(
          { err: backupError, filePath: this.#filePath },
          'Falha ao preservar configuração corrompida',
        );
      }
      this.logger?.error(
        { err: error, filePath: this.#filePath, backupPath },
        'Configuração inválida isolada; iniciando com dados vazios',
      );
    }
  }

  #commit(guildId: string, next: GuildSettings): void {
    const previous = this.#settings.get(guildId);
    this.#settings.set(guildId, next);
    try {
      this.#save();
    } catch (error) {
      if (previous) this.#settings.set(guildId, previous);
      else this.#settings.delete(guildId);
      throw error;
    }
  }

  #save(): void {
    mkdirSync(dirname(this.#filePath), { recursive: true });
    const payload = guildSettingsFileSchema.parse({ version: 1, guilds: this.list() });
    const temporaryPath = `${this.#filePath}.${String(process.pid)}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    renameSync(temporaryPath, this.#filePath);
  }
}
