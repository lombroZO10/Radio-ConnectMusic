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
    });
  }

  setStation(guildId: string, stationId: string): void {
    const current = this.#settings.get(guildId);
    if (!current) throw new Error('Configure o canal de voz antes de salvar a estação.');
    this.#commit(guildId, { ...current, stationId });
  }

  clearStation(guildId: string): void {
    const current = this.#settings.get(guildId);
    if (!current?.stationId) return;
    this.#commit(guildId, {
      guildId: current.guildId,
      voiceChannelId: current.voiceChannelId,
    });
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
