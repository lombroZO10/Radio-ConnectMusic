import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { JsonGuildSettingsRepository } from '../src/settings/json-guild-settings-repository.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function temporarySettingsPath(): { directory: string; filePath: string } {
  const directory = mkdtempSync(join(tmpdir(), 'radio-connect-settings-'));
  temporaryDirectories.push(directory);
  return { directory, filePath: join(directory, 'guild-settings.json') };
}

describe('JsonGuildSettingsRepository', () => {
  it('persiste o canal e a estação para restauração após reinício', () => {
    const { filePath } = temporarySettingsPath();
    const repository = new JsonGuildSettingsRepository(filePath);
    repository.setVoiceChannel('1301004852880478269', '1301005514733256724');
    repository.setStation('1301004852880478269', 'studio-souto-rap-nacional');

    const restored = new JsonGuildSettingsRepository(filePath);
    expect(restored.get('1301004852880478269')).toEqual({
      guildId: '1301004852880478269',
      voiceChannelId: '1301005514733256724',
      stationId: 'studio-souto-rap-nacional',
    });

    restored.setVoiceChannel('1301004852880478269', '1301005516134420552');
    expect(restored.get('1301004852880478269')?.stationId).toBe('studio-souto-rap-nacional');

    restored.clearStation('1301004852880478269');
    expect(JSON.parse(readFileSync(filePath, 'utf8'))).toMatchObject({
      guilds: [{ guildId: '1301004852880478269', voiceChannelId: '1301005516134420552' }],
    });
  });

  it('isola um arquivo corrompido em vez de derrubar o bot', () => {
    const { directory, filePath } = temporarySettingsPath();
    writeFileSync(filePath, '{configuracao-invalida', 'utf8');

    const repository = new JsonGuildSettingsRepository(filePath);

    expect(repository.list()).toEqual([]);
    expect(existsSync(filePath)).toBe(false);
    expect(
      readdirSync(directory).some((name) => name.startsWith('guild-settings.json.corrupt-')),
    ).toBe(true);
  });
});
