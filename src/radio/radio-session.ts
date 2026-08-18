import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  type AudioPlayer,
  type VoiceConnection,
} from '@discordjs/voice';
import type { VoiceBasedChannel } from 'discord.js';
import type prism from 'prism-media';

import type { RadioConfig, Station } from '../config/schemas.js';
import type { logger as rootLogger } from '../shared/logger.js';
import { createStationTranscoder } from './create-transcoder.js';

type Logger = typeof rootLogger;

export function calculateReconnectDelay(
  baseDelayMs: number,
  maximumDelayMs: number,
  exponentialAttempts: number,
  attempt: number,
): number {
  const exponent = Math.min(Math.max(attempt - 1, 0), exponentialAttempts - 1);
  return Math.min(baseDelayMs * 2 ** exponent, maximumDelayMs);
}

export interface SessionSnapshot {
  station: Station;
  channelId: string;
}

export class VoiceConnectionSupersededError extends Error {
  constructor() {
    super('A tentativa de conexão foi substituída por um canal mais recente.');
    this.name = 'VoiceConnectionSupersededError';
  }
}

export class RadioSession {
  readonly #settings: RadioConfig['playback'];
  readonly #logger: Logger;
  readonly #player: AudioPlayer;
  #transcoder: prism.FFmpeg | undefined;
  #connection: VoiceConnection | undefined;
  #channel: VoiceBasedChannel | undefined;
  #station: Station | undefined;
  #channelId: string | undefined;
  #reconnectAttempts = 0;
  #reconnectTimer: NodeJS.Timeout | undefined;
  #playbackStabilityTimer: NodeJS.Timeout | undefined;
  #voiceReconnectAttempts = 0;
  #voiceReconnectTimer: NodeJS.Timeout | undefined;
  #healthCheckTimer: NodeJS.Timeout;
  #connectionTask: Promise<void> | undefined;
  #connectionGeneration = 0;
  #playbackGeneration = 0;
  #stoppedIntentionally = false;

  constructor(guildId: string, settings: RadioConfig['playback'], logger: Logger) {
    this.#settings = settings;
    this.#logger = logger.child({ guildId });
    this.#player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Play },
    });

    this.#player.on('error', (error) => {
      this.#clearPlaybackStabilityTimer();
      this.#destroyTranscoder();
      this.#logger.error({ err: error, stationId: this.#station?.id }, 'Falha no áudio');
      this.#scheduleReconnect();
    });
    this.#player.on(AudioPlayerStatus.Playing, () => {
      this.#schedulePlaybackStabilityConfirmation();
      this.#logger.info(
        { stationId: this.#station?.id, recoveryAttempt: this.#reconnectAttempts },
        'Transmissão iniciada',
      );
    });
    this.#player.on(AudioPlayerStatus.Idle, () => {
      this.#clearPlaybackStabilityTimer();
      if (!this.#stoppedIntentionally && this.#station) this.#scheduleReconnect();
    });
    this.#healthCheckTimer = setInterval(() => {
      try {
        this.#runHealthCheck();
      } catch (error) {
        this.#logger.error({ err: error }, 'Falha no monitor interno da rádio');
      }
    }, this.#settings.healthCheckIntervalMs);
    this.#healthCheckTimer.unref();
  }

  async connect(channel: VoiceBasedChannel): Promise<void> {
    this.#clearVoiceReconnectTimer();
    this.#channel = channel;
    if (this.#connectionTask && this.#channelId === channel.id) {
      await this.#connectionTask;
      return;
    }
    if (
      this.#connection?.joinConfig.channelId === channel.id &&
      this.#connection.state.status === VoiceConnectionStatus.Ready
    ) {
      this.#connection.subscribe(this.#player);
      return;
    }

    const generation = ++this.#connectionGeneration;
    this.#destroyConnection();
    this.#channelId = channel.id;
    const task = this.#connectWithRetries(channel, generation);
    this.#connectionTask = task;
    try {
      await task;
    } catch (error) {
      if (generation === this.#connectionGeneration) this.#scheduleVoiceReconnect();
      throw error;
    } finally {
      if (this.#connectionTask === task) this.#connectionTask = undefined;
    }
  }

  async play(channel: VoiceBasedChannel, station: Station): Promise<void> {
    const playbackGeneration = ++this.#playbackGeneration;
    this.#station = station;
    this.#stoppedIntentionally = false;
    this.#clearReconnectTimer();
    await this.connect(channel);
    if (playbackGeneration !== this.#playbackGeneration) return;
    this.#startResource(station);
  }

  stopPlayback(): void {
    this.#stoppedIntentionally = true;
    this.#playbackGeneration += 1;
    this.#clearReconnectTimer();
    this.#clearPlaybackStabilityTimer();
    this.#destroyTranscoder();
    this.#player.stop(true);
    this.#station = undefined;
    this.#reconnectAttempts = 0;
  }

  disconnect(): void {
    this.stopPlayback();
    this.#connectionGeneration += 1;
    this.#clearVoiceReconnectTimer();
    this.#destroyConnection();
    this.#channel = undefined;
    this.#channelId = undefined;
  }

  dispose(): void {
    this.disconnect();
    clearInterval(this.#healthCheckTimer);
    this.#clearPlaybackStabilityTimer();
  }

  snapshot(): SessionSnapshot | undefined {
    if (!this.#station || !this.#channelId) return undefined;
    return { station: this.#station, channelId: this.#channelId };
  }

  channelId(): string | undefined {
    return this.#channelId;
  }

  #startResource(station: Station): void {
    if (this.#stoppedIntentionally || this.#station?.id !== station.id) return;
    try {
      this.#destroyTranscoder();
      const transcoder = createStationTranscoder(station, this.#settings);
      this.#transcoder = transcoder;
      transcoder.process.once('close', (code, signal) => {
        if (this.#transcoder === transcoder) this.#transcoder = undefined;
        if (!this.#stoppedIntentionally && code !== 0 && code !== null) {
          this.#logger.warn(
            { code, signal, stationId: station.id },
            'Processo do FFmpeg foi encerrado inesperadamente',
          );
        }
      });
      const resource = createAudioResource(transcoder, {
        inputType: StreamType.OggOpus,
        metadata: station,
      });
      this.#player.play(resource);
    } catch (error) {
      this.#destroyTranscoder();
      this.#logger.error({ err: error, stationId: station.id }, 'Falha ao abrir a transmissão');
      this.#scheduleReconnect();
    }
  }

  async #connectWithRetries(channel: VoiceBasedChannel, generation: number): Promise<void> {
    this.#assertCurrentConnection(generation);
    const maximumAttempts = this.#settings.voiceConnectAttempts;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      this.#assertCurrentConnection(generation);
      const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false,
      });
      this.#connection = connection;
      connection.on('error', (error) => {
        this.#logger.error({ err: error, channelId: channel.id }, 'Erro na conexão de voz');
      });
      connection.on('stateChange', (oldState, newState) => {
        const stateLog = {
          from: oldState.status,
          to: newState.status,
          channelId: channel.id,
          voiceAttempt: attempt,
        };
        if (oldState.status === newState.status) {
          this.#logger.debug(stateLog, 'Detalhes internos da conexão de voz alterados');
        } else {
          this.#logger.info(stateLog, 'Estado da conexão de voz alterado');
        }
        if (newState.status === VoiceConnectionStatus.Ready) {
          this.#voiceReconnectAttempts = 0;
          this.#clearVoiceReconnectTimer();
        } else if (
          newState.status === VoiceConnectionStatus.Disconnected &&
          connection === this.#connection
        ) {
          void this.#recoverDisconnectedConnection(connection, generation).catch(
            (error: unknown) => {
              this.#logger.warn(
                { err: error, channelId: channel.id },
                'A conexão de voz não se recuperou automaticamente',
              );
              if (connection === this.#connection) this.#destroyConnection();
              this.#scheduleVoiceReconnect();
            },
          );
        }
      });

      try {
        await entersState(
          connection,
          VoiceConnectionStatus.Ready,
          this.#settings.connectionTimeoutMs,
        );
        this.#assertCurrentConnection(generation);
        connection.subscribe(this.#player);
        this.#logger.info(
          { channelId: channel.id, voiceAttempt: attempt },
          'Conexão de voz pronta',
        );
        return;
      } catch (error) {
        this.#assertCurrentConnection(generation);
        lastError = error;
        this.#logger.warn(
          { err: error, channelId: channel.id, voiceAttempt: attempt, maximumAttempts },
          'Negociação de voz expirou; criando uma conexão nova',
        );
        if (this.#connection === connection) this.#destroyConnection();
        else if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
        if (attempt < maximumAttempts) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.#settings.reconnectDelayMs * attempt),
          );
        }
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Não foi possível estabelecer a conexão de voz.');
  }

  #assertCurrentConnection(generation: number): void {
    if (generation !== this.#connectionGeneration) {
      throw new VoiceConnectionSupersededError();
    }
  }

  #destroyConnection(): void {
    const connection = this.#connection;
    this.#connection = undefined;
    if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) {
      connection.destroy();
    }
  }

  #scheduleReconnect(): void {
    if (this.#stoppedIntentionally || !this.#station || this.#reconnectTimer) {
      return;
    }
    this.#reconnectAttempts += 1;
    const station = this.#station;
    const delayMs = this.#reconnectDelay(this.#reconnectAttempts);
    this.#logger.warn(
      { attempt: this.#reconnectAttempts, delayMs, stationId: station.id },
      'Tentando reconectar a transmissão',
    );
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = undefined;
      this.#startResource(station);
    }, delayMs);
    this.#reconnectTimer.unref();
  }

  #clearReconnectTimer(): void {
    if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = undefined;
  }

  async #recoverDisconnectedConnection(
    connection: VoiceConnection,
    generation: number,
  ): Promise<void> {
    await Promise.race([
      entersState(
        connection,
        VoiceConnectionStatus.Signalling,
        this.#settings.voiceRecoveryTimeoutMs,
      ),
      entersState(
        connection,
        VoiceConnectionStatus.Connecting,
        this.#settings.voiceRecoveryTimeoutMs,
      ),
    ]);
    this.#assertCurrentConnection(generation);
    await entersState(connection, VoiceConnectionStatus.Ready, this.#settings.connectionTimeoutMs);
    this.#assertCurrentConnection(generation);
    connection.subscribe(this.#player);
    this.#logger.info({ channelId: this.#channelId }, 'Conexão de voz recuperada');
  }

  #scheduleVoiceReconnect(): void {
    const channel = this.#channel;
    if (!channel || this.#voiceReconnectTimer) return;
    this.#voiceReconnectAttempts += 1;
    const delayMs = this.#reconnectDelay(this.#voiceReconnectAttempts);
    this.#logger.warn(
      { attempt: this.#voiceReconnectAttempts, delayMs, channelId: channel.id },
      'Agendando reconexão ao canal de voz',
    );
    this.#voiceReconnectTimer = setTimeout(() => {
      this.#voiceReconnectTimer = undefined;
      void this.connect(channel).catch((error: unknown) => {
        this.#logger.error(
          { err: error, channelId: channel.id },
          'Falha ao reconectar ao canal de voz',
        );
        this.#scheduleVoiceReconnect();
      });
    }, delayMs);
    this.#voiceReconnectTimer.unref();
  }

  #clearVoiceReconnectTimer(): void {
    if (this.#voiceReconnectTimer) clearTimeout(this.#voiceReconnectTimer);
    this.#voiceReconnectTimer = undefined;
  }

  #runHealthCheck(): void {
    if (!this.#channel) return;
    if (this.#connection?.state.status !== VoiceConnectionStatus.Ready) {
      this.#scheduleVoiceReconnect();
    }
    if (
      this.#station &&
      !this.#stoppedIntentionally &&
      this.#player.state.status === AudioPlayerStatus.Idle
    ) {
      this.#scheduleReconnect();
    }
  }

  #reconnectDelay(attempt: number): number {
    return calculateReconnectDelay(
      this.#settings.reconnectDelayMs,
      this.#settings.maxReconnectDelayMs,
      this.#settings.maxReconnectAttempts,
      attempt,
    );
  }

  #schedulePlaybackStabilityConfirmation(): void {
    this.#clearPlaybackStabilityTimer();
    const stationId = this.#station?.id;
    if (!stationId) return;
    this.#playbackStabilityTimer = setTimeout(() => {
      this.#playbackStabilityTimer = undefined;
      if (
        this.#station?.id === stationId &&
        this.#player.state.status === AudioPlayerStatus.Playing
      ) {
        this.#reconnectAttempts = 0;
        this.#logger.debug({ stationId }, 'Transmissão considerada estável');
      }
    }, this.#settings.minimumStablePlaybackMs);
    this.#playbackStabilityTimer.unref();
  }

  #clearPlaybackStabilityTimer(): void {
    if (this.#playbackStabilityTimer) clearTimeout(this.#playbackStabilityTimer);
    this.#playbackStabilityTimer = undefined;
  }

  #destroyTranscoder(): void {
    const transcoder = this.#transcoder;
    this.#transcoder = undefined;
    if (transcoder && !transcoder.destroyed) transcoder.destroy();
  }
}
