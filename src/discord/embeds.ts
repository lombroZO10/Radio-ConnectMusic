import { EmbedBuilder } from 'discord.js';

import { config } from '../config/index.js';
import type { Station } from '../config/schemas.js';

export const brandColor = Number.parseInt(config.branding.color.slice(1), 16);

export function stationEmbed(station: Station): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(brandColor)
    .setTitle(`📻 ${station.name}`)
    .setDescription(station.description)
    .addFields({ name: 'Gêneros', value: station.genres.join(' • '), inline: true })
    .setURL(station.homepageUrl)
    .setFooter({ text: config.branding.name });
  if (station.logoUrl) embed.setThumbnail(station.logoUrl);
  return embed;
}
