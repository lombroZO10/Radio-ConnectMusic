import { config } from './config/index.js';
import { createRadioCommand } from './discord/commands/radio.command.js';
import { createDiscordClient } from './discord/create-client.js';
import { createConfigPanelFeature } from './discord/features/config-panel.js';
import { RadioManager } from './radio/radio-manager.js';
import { StationCatalog } from './radio/station-catalog.js';
import { StationUsageRepository } from './radio/station-usage.js';
import { JsonGuildSettingsRepository } from './settings/json-guild-settings-repository.js';
import { logger } from './shared/logger.js';

export function createApplication() {
  const catalog = new StationCatalog(config.stations);
  const radio = new RadioManager(config, logger);
  const settings = new JsonGuildSettingsRepository(undefined, logger);
  const stationUsage = new StationUsageRepository();
  const configPanel = createConfigPanelFeature(settings, radio, catalog);
  const commands = [createRadioCommand(catalog, radio, settings, stationUsage), configPanel.command];
  const componentHandlers = [configPanel.componentHandler];
  const client = createDiscordClient(commands, componentHandlers, radio, settings, catalog);
  return { client, commands, componentHandlers, catalog, radio, settings, stationUsage };
}
