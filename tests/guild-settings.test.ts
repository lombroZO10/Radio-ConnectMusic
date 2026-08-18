import { describe, expect, it } from 'vitest';

import { guildSettingsFileSchema } from '../src/settings/guild-settings.js';

describe('guildSettingsFileSchema', () => {
  it('valida uma configuração por servidor', () => {
    const result = guildSettingsFileSchema.safeParse({
      version: 1,
      guilds: [{ guildId: '1301004852880478269', voiceChannelId: '1234567890123456789' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejeita identificadores não numéricos', () => {
    const result = guildSettingsFileSchema.safeParse({
      version: 1,
      guilds: [{ guildId: 'servidor', voiceChannelId: 'canal' }],
    });
    expect(result.success).toBe(false);
  });
});
