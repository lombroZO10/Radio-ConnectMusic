import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { z } from 'zod';

const usageEntrySchema = z.object({
  plays: z.number().int().nonnegative(),
  lastSelectedAt: z.number().int().positive().optional(),
});

const usageFileSchema = z.object({
  version: z.literal(1),
  stations: z.record(z.string(), usageEntrySchema),
});

export type StationUsage = z.infer<typeof usageEntrySchema>;

/** Persiste apenas métricas agregadas; não armazena usuários nem conteúdo de áudio. */
export class StationUsageRepository {
  readonly #filePath: string;
  readonly #usage = new Map<string, StationUsage>();

  constructor(filePath = resolve(process.cwd(), 'data', 'station-usage.json')) {
    this.#filePath = filePath;
    this.#load();
  }

  record(stationId: string): StationUsage {
    const next = {
      plays: (this.#usage.get(stationId)?.plays ?? 0) + 1,
      lastSelectedAt: Date.now(),
    };
    this.#usage.set(stationId, next);
    this.#save();
    return next;
  }

  get(stationId: string): StationUsage {
    return this.#usage.get(stationId) ?? { plays: 0 };
  }

  top(stationIds: readonly string[], limit = 10): readonly { stationId: string; usage: StationUsage }[] {
    return stationIds
      .map((stationId) => ({ stationId, usage: this.get(stationId) }))
      .sort((a, b) => b.usage.plays - a.usage.plays || (b.usage.lastSelectedAt ?? 0) - (a.usage.lastSelectedAt ?? 0))
      .slice(0, limit);
  }

  #load(): void {
    if (!existsSync(this.#filePath)) return;
    try {
      const file = usageFileSchema.parse(JSON.parse(readFileSync(this.#filePath, 'utf8')));
      for (const [stationId, usage] of Object.entries(file.stations)) this.#usage.set(stationId, usage);
    } catch {
      // Métricas não podem impedir o bot de iniciar. O arquivo será recriado na próxima seleção.
      this.#usage.clear();
    }
  }

  #save(): void {
    mkdirSync(dirname(this.#filePath), { recursive: true });
    const stations = Object.fromEntries(this.#usage.entries());
    const temporaryPath = `${this.#filePath}.${String(process.pid)}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify({ version: 1, stations }, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    renameSync(temporaryPath, this.#filePath);
  }
}
