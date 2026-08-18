import type { VoiceBasedChannel } from 'discord.js';

import type { RadioConfig, Station } from '../config/schemas.js';
import type { logger as rootLogger } from '../shared/logger.js';
import { RadioSession, type RadioStatusSnapshot, type SessionSnapshot } from './radio-session.js';

type Logger = typeof rootLogger;

export class RadioManager {
  readonly #sessions = new Map<string, RadioSession>();

  constructor(
    private readonly config: RadioConfig,
    private readonly logger: Logger,
  ) {}

  async connect(channel: VoiceBasedChannel): Promise<void> {
    const session = this.#getOrCreate(channel.guild.id);
    await session.connect(channel);
  }

  async play(channel: VoiceBasedChannel, station: Station): Promise<void> {
    const session = this.#getOrCreate(channel.guild.id);
    try {
      await session.play(channel, station);
    } catch (error) {
      session.stopPlayback();
      throw error;
    }
  }

  stop(guildId: string): boolean {
    const session = this.#sessions.get(guildId);
    if (!session) return false;
    session.stopPlayback();
    return true;
  }

  disconnect(guildId: string): boolean {
    const session = this.#sessions.get(guildId);
    if (!session) return false;
    session.disconnect();
    return true;
  }

  get(guildId: string): SessionSnapshot | undefined {
    return this.#sessions.get(guildId)?.snapshot();
  }

  getStatus(guildId: string): RadioStatusSnapshot | undefined {
    return this.#sessions.get(guildId)?.statusSnapshot();
  }

  getChannelId(guildId: string): string | undefined {
    return this.#sessions.get(guildId)?.channelId();
  }

  stopAll(): void {
    for (const session of this.#sessions.values()) session.dispose();
    this.#sessions.clear();
  }

  #getOrCreate(guildId: string): RadioSession {
    const current = this.#sessions.get(guildId);
    if (current) return current;
    const session = new RadioSession(guildId, this.config.playback, this.logger);
    this.#sessions.set(guildId, session);
    return session;
  }
}
