import type { Station } from '../config/schemas.js';

interface CacheEntry {
  value: string | undefined;
  expiresAt: number;
  pending?: Promise<string | undefined> | undefined;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 20_000;
const REQUEST_TIMEOUT_MS = 8_000;

/** Lê o título ICY sem tocar no fluxo de áudio principal. */
export function getCurrentTrack(station: Station): Promise<string | undefined> {
  const now = Date.now();
  const current = cache.get(station.id);
  if (current && current.expiresAt > now) return Promise.resolve(current.value);
  if (current?.pending) return current.pending;
  const pending = readTrackMetadata(station).finally(() => {
    const entry = cache.get(station.id);
    if (entry) entry.pending = undefined;
  });
  cache.set(station.id, { value: current?.value, expiresAt: now + CACHE_TTL_MS, pending });
  return pending;
}

async function readTrackMetadata(station: Station): Promise<string | undefined> {
  const icyTitle = await readIcyTitle(station);
  if (icyTitle) return icyTitle;
  return readTritonNowPlaying(station);
}

async function readIcyTitle(station: Station): Promise<string | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  timeout.unref();
  try {
    const response = await fetch(station.streamUrl, {
      headers: { 'Icy-MetaData': '1', Accept: '*/*' },
      signal: controller.signal,
    });
    if (!response.ok || !response.body) return undefined;
    const directTitle = response.headers.get('icy-title')?.trim();
    if (directTitle) {
      await response.body.cancel().catch(() => undefined);
      return normalizeTitle(directTitle);
    }
    const metaint = Number.parseInt(response.headers.get('icy-metaint') ?? '', 10);
    if (!Number.isFinite(metaint) || metaint <= 0) return undefined;
    let pendingAudioBytes = metaint;
    let metadataBytes = 0;
    let metadata = Buffer.alloc(0);
    for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
      let offset = 0;
      while (offset < chunk.byteLength) {
        if (metadataBytes > 0) {
          const take = Math.min(metadataBytes, chunk.byteLength - offset);
          metadata = Buffer.concat([metadata, Buffer.from(chunk.subarray(offset, offset + take))]);
          metadataBytes -= take;
          offset += take;
          if (metadataBytes === 0) {
            const title = extractTitle(decodeIcyMetadata(metadata));
            if (title) {
              await response.body.cancel().catch(() => undefined);
              return title;
            }
            metadata = Buffer.alloc(0);
            pendingAudioBytes = metaint;
          }
          continue;
        }
        if (pendingAudioBytes > 0) {
          const take = Math.min(pendingAudioBytes, chunk.byteLength - offset);
          pendingAudioBytes -= take;
          offset += take;
          continue;
        }
        const lengthByte = chunk[offset];
        if (lengthByte === undefined) break;
        metadataBytes = lengthByte * 16;
        offset += 1;
        if (metadataBytes === 0) pendingAudioBytes = metaint;
      }
    }
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
  return undefined;
}

/** StreamTheWorld/Triton entrega o áudio sem icy-metaint, mas expõe um XML público de now playing. */
async function readTritonNowPlaying(station: Station): Promise<string | undefined> {
  let mountName: string | undefined;
  try {
    const stream = new URL(station.streamUrl);
    if (!stream.hostname.includes('streamtheworld.com')) return undefined;
    const match = /\/redirect\/([^/?]+)/iu.exec(stream.pathname);
    mountName = match?.[1]?.replace(/\.(?:aac|mp3|m3u8)$/iu, '');
  } catch {
    return undefined;
  }
  if (!mountName) return undefined;
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  timeout.unref();
  try {
    const endpoint = new URL('https://np.tritondigital.com/public/nowplaying');
    endpoint.searchParams.set('mountName', mountName);
    endpoint.searchParams.set('numberToFetch', '3');
    endpoint.searchParams.set('eventType', 'track');
    const response = await fetch(endpoint, { signal: controller.signal });
    if (!response.ok) return undefined;
    const xml = await response.text();
    const latest = /<nowplaying-info\b[^>]*>.*?<\/nowplaying-info>/isu.exec(xml)?.[0];
    if (!latest) return undefined;
    const title = readXmlProperty(latest, 'cue_title');
    const artist = readXmlProperty(latest, 'track_artist_name');
    if (isPlaceholder(title) || isPlaceholder(artist)) return undefined;
    if (artist && title) return normalizeTitle(`${artist} - ${title}`);
    return normalizeTitle(title ?? artist ?? '');
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

function readXmlProperty(xml: string, name: string): string | undefined {
  const match = new RegExp(`<property\\s+name=["']${name}["'][^>]*>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\\/property>`, 'isu').exec(xml);
  return match?.[1]?.trim();
}

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  return /^(?:#(?:song|singer|artist|title)#(?:\s*-\s*#(?:song|singer|artist|title)#)?|unknown)$/iu.test(value.trim());
}

function extractTitle(metadata: string): string | undefined {
  const match = /StreamTitle='([^']*)';/iu.exec(metadata);
  const value = match?.[1];
  return value ? normalizeTitle(value) : undefined;
}

function decodeIcyMetadata(value: Buffer): string {
  const utf8 = value.toString('utf8');
  return utf8.includes('\uFFFD') ? value.toString('latin1') : utf8;
}

function normalizeTitle(value: string): string | undefined {
  const title = value.replace(/\s+/gu, ' ').trim();
  return title && !isPlaceholder(title) ? title.slice(0, 256) : undefined;
}
