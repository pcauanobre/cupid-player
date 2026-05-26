import type { Track } from './room';

const API_BASE = 'https://www.googleapis.com/youtube/v3';

async function ytApi(path: string, accessToken: string, params: Record<string, string> = {}) {
  const url = new URL(`${API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`YouTube API ${res.status}: ${text}`);
  }
  return res.json();
}

export type Playlist = {
  id: string;
  name: string;
  image: string | null;
  trackCount: number;
};

export function parsePlaylistUrl(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  if (/^[A-Za-z0-9_-]{13,}$/.test(trimmed) && /^(PL|LL|FL|RD|UU|UL|OL)/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com' || host === 'youtu.be') {
      const list = url.searchParams.get('list');
      if (list) return list;
    }
  } catch {
    // not a URL
  }

  return null;
}

export async function fetchMyPlaylists(accessToken: string): Promise<Playlist[]> {
  const playlists: Playlist[] = [];
  let pageToken: string | undefined;
  do {
    const data: any = await ytApi('/playlists', accessToken, {
      part: 'snippet,contentDetails',
      mine: 'true',
      maxResults: '50',
      ...(pageToken ? { pageToken } : {}),
    });
    for (const p of data.items ?? []) {
      const thumbs = p.snippet?.thumbnails ?? {};
      const thumb = thumbs.medium ?? thumbs.default ?? thumbs.high;
      playlists.push({
        id: p.id,
        name: p.snippet?.title ?? '(untitled)',
        image: thumb?.url ?? null,
        trackCount: p.contentDetails?.itemCount ?? 0,
      });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  try {
    const ch: any = await ytApi('/channels', accessToken, { part: 'contentDetails', mine: 'true' });
    const likesId = ch.items?.[0]?.contentDetails?.relatedPlaylists?.likes;
    if (likesId) {
      playlists.unshift({ id: likesId, name: 'Liked Videos', image: null, trackCount: 0 });
    }
  } catch {
    // non-fatal
  }

  return playlists;
}

export async function fetchPlaylistTracks(playlistId: string, accessToken: string): Promise<Track[]> {
  const tracks: Track[] = [];
  let pageToken: string | undefined;
  do {
    const data: any = await ytApi('/playlistItems', accessToken, {
      part: 'snippet,contentDetails',
      playlistId,
      maxResults: '50',
      ...(pageToken ? { pageToken } : {}),
    });
    for (const item of data.items ?? []) {
      const videoId = item.contentDetails?.videoId;
      if (!videoId) continue;
      const snip = item.snippet ?? {};
      if (snip.title === 'Private video' || snip.title === 'Deleted video') continue;
      const thumbs = snip.thumbnails ?? {};
      const thumb = thumbs.medium ?? thumbs.default ?? thumbs.high;
      tracks.push({
        videoId,
        title: snip.title ?? videoId,
        artist: snip.videoOwnerChannelTitle ?? snip.channelTitle ?? '',
        art: thumb?.url ?? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
      });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return tracks;
}

export async function searchVideos(query: string, accessToken: string, max = 10): Promise<Track[]> {
  const data: any = await ytApi('/search', accessToken, {
    part: 'snippet',
    type: 'video',
    videoCategoryId: '10', // Music
    q: query,
    maxResults: String(max),
  });
  const out: Track[] = [];
  for (const item of data.items ?? []) {
    const videoId = item.id?.videoId;
    if (!videoId) continue;
    const snip = item.snippet ?? {};
    const thumbs = snip.thumbnails ?? {};
    const thumb = thumbs.medium ?? thumbs.default ?? thumbs.high;
    out.push({
      videoId,
      title: snip.title ?? videoId,
      artist: snip.channelTitle ?? '',
      art: thumb?.url ?? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    });
  }
  return out;
}
