import { describe, expect, it } from 'vitest';

import type { Station } from '../src/config/schemas.js';
import { StationCatalog } from '../src/radio/station-catalog.js';

const stations: Station[] = [
  {
    id: 'rock-br',
    name: 'Rock Brasil',
    description: 'Rock nacional e internacional.',
    genres: ['Rock', 'Clássicos'],
    country: 'BR',
    language: 'pt',
    streamUrl: 'https://stream.example.com/rock',
    homepageUrl: 'https://example.com/rock',
    logoUrl: null,
    enabled: true,
  },
  {
    id: 'sertanejo',
    name: 'Conexão Sertaneja',
    description: 'Sertanejo de todas as épocas.',
    genres: ['Sertanejo'],
    country: 'BR',
    language: 'pt',
    streamUrl: 'https://stream.example.com/sertanejo',
    homepageUrl: 'https://example.com/sertanejo',
    logoUrl: null,
    enabled: false,
  },
];

describe('StationCatalog', () => {
  it('expõe somente estações habilitadas', () => {
    expect(new StationCatalog(stations).list()).toHaveLength(1);
  });

  it('busca sem diferenciar acentos ou maiúsculas', () => {
    const catalog = new StationCatalog(stations);
    expect(catalog.search('classicos').map((station) => station.id)).toEqual(['rock-br']);
  });

  it('rejeita IDs duplicados mesmo se uma estação estiver desabilitada', () => {
    expect(() => new StationCatalog([...stations, ...stations.slice(0, 1)])).toThrow(
      'ID de estação duplicado',
    );
  });
});
