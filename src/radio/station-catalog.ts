import type { Station } from '../config/schemas.js';

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLocaleLowerCase('pt-BR');

export class StationCatalog {
  readonly #stations: readonly Station[];

  constructor(stations: readonly Station[]) {
    const ids = new Set<string>();
    for (const station of stations) {
      if (ids.has(station.id)) {
        throw new Error(`ID de estação duplicado: ${station.id}`);
      }
      ids.add(station.id);
    }
    this.#stations = stations.filter((station) => station.enabled);
  }

  getById(id: string): Station | undefined {
    return this.#stations.find((station) => station.id === id);
  }

  list(genre?: string): readonly Station[] {
    if (!genre) return this.#stations;
    const expected = normalize(genre);
    return this.#stations.filter((station) =>
      station.genres.some((item) => normalize(item) === expected),
    );
  }

  search(query: string, limit = 25): readonly Station[] {
    const term = normalize(query);
    return this.#stations
      .filter((station) => {
        const haystack = [station.id, station.name, ...station.genres].map(normalize);
        return haystack.some((item) => item.includes(term));
      })
      .slice(0, limit);
  }

  genres(): readonly string[] {
    return [...new Set(this.#stations.flatMap((station) => station.genres))].sort((a, b) =>
      a.localeCompare(b, 'pt-BR'),
    );
  }
}
