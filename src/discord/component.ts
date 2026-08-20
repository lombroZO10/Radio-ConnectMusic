import type { MessageComponentInteraction, ModalSubmitInteraction } from 'discord.js';

export type ComponentInteraction = MessageComponentInteraction | ModalSubmitInteraction;

export interface ComponentHandler {
  canHandle(customId: string): boolean;
  execute(interaction: ComponentInteraction): Promise<void>;
}
