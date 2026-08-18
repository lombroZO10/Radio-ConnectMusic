import type { MessageComponentInteraction } from 'discord.js';

export interface ComponentHandler {
  canHandle(customId: string): boolean;
  execute(interaction: MessageComponentInteraction): Promise<void>;
}
