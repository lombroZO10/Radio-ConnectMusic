import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import 'dotenv/config';

import { environmentSchema, radioConfigSchema } from './schemas.js';

function loadJsonConfig() {
  const path = resolve(process.cwd(), 'config', 'radio.config.json');
  const content: unknown = JSON.parse(readFileSync(path, 'utf8'));
  return radioConfigSchema.parse(content);
}

export const config = loadJsonConfig();
export const environment = environmentSchema.parse(process.env);
