import prism from 'prism-media';

import type { RadioConfig, Station } from '../config/schemas.js';

export function buildFfmpegArguments(
  station: Station,
  playback: RadioConfig['playback'],
): string[] {
  return [
    '-nostdin',
    '-hide_banner',
    '-loglevel',
    'warning',
    '-reconnect',
    '1',
    '-reconnect_streamed',
    '1',
    '-reconnect_delay_max',
    '5',
    '-rw_timeout',
    '30000000',
    '-i',
    station.streamUrl,
    '-map',
    '0:a:0',
    '-vn',
    '-acodec',
    'libopus',
    '-b:a',
    `${String(playback.audioBitrateKbps)}k`,
    '-vbr',
    'on',
    '-compression_level',
    String(playback.encoderComplexity),
    '-application',
    'audio',
    '-frame_duration',
    '20',
    '-ar',
    '48000',
    '-ac',
    '2',
    '-threads',
    '1',
    '-f',
    'opus',
  ];
}

export function createStationTranscoder(
  station: Station,
  playback: RadioConfig['playback'],
): prism.FFmpeg {
  return new prism.FFmpeg({ args: buildFfmpegArguments(station, playback) });
}
