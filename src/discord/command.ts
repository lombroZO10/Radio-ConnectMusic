import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
  SlashCommandBuilder,
} from 'discord.js';

export interface CommandContext {
  interaction: ChatInputCommandInteraction;
}

export interface DiscordCommand {
  data: Pick<SlashCommandBuilder, 'name'> & {
    toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody;
  };
  execute(context: CommandContext): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction): Promise<void>;
}
