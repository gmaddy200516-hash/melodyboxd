const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = import.meta.env.VITE_SPOTIFY_CLIENT_SECRET;

let accessToken: string | null = null;
let tokenExpiry: number = 0;

export interface SpotifyArtist {
  id: string;
  name: string;
  images: { url: string; height: number; width: number }[];
  genres: string[];
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: {
    id: string;
    name: string;
    images: { url: string; height: number; width: number }[];
    release_date: string;
  };
  duration_ms: number;
  popularity: number;
  preview_url: string | null;
  external_urls: {
    spotify: string;
  };
}

async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiry) {
    return accessToken;
  }

  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('Spotify credentials not configured');
  }

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`,
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    throw new Error('Failed to get Spotify access token');
  }

  const data = await response.json();
  accessToken = data.access_token;
  tokenExpiry = Date.now() + data.expires_in * 1000 - 60000;

  return accessToken;
}

async function spotifyFetch(endpoint: string): Promise<any> {
  const token = await getAccessToken();

  const response = await fetch(`${SPOTIFY_API_BASE}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Spotify API error: ${response.statusText}`);
  }

  return response.json();
}

export async function searchTracks(query: string, limit: number = 20): Promise<SpotifyTrack[]> {
  const data = await spotifyFetch(
    `/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`
  );

  return data.tracks.items;
}

export async function searchArtists(query: string, limit: number = 20): Promise<SpotifyArtist[]> {
  const data = await spotifyFetch(
    `/search?q=${encodeURIComponent(query)}&type=artist&limit=${limit}`
  );

  return data.artists.items;
}

export async function getTrack(trackId: string): Promise<SpotifyTrack> {
  return spotifyFetch(`/tracks/${trackId}`);
}

export async function getArtist(artistId: string): Promise<SpotifyArtist> {
  return spotifyFetch(`/artists/${artistId}`);
}

export async function getArtistTopTracks(artistId: string): Promise<SpotifyTrack[]> {
  const data = await spotifyFetch(`/artists/${artistId}/top-tracks?market=US`);
  return data.tracks;
}

export async function getRecommendations(
  seedTracks?: string[],
  seedArtists?: string[],
  seedGenres?: string[],
  limit: number = 20
): Promise<SpotifyTrack[]> {
  const params = new URLSearchParams();

  if (seedTracks && seedTracks.length > 0) {
    params.append('seed_tracks', seedTracks.slice(0, 5).join(','));
  }
  if (seedArtists && seedArtists.length > 0) {
    params.append('seed_artists', seedArtists.slice(0, 5).join(','));
  }
  if (seedGenres && seedGenres.length > 0) {
    params.append('seed_genres', seedGenres.slice(0, 5).join(','));
  }

  params.append('limit', limit.toString());

  const data = await spotifyFetch(`/recommendations?${params.toString()}`);
  return data.tracks;
}

export function getSpotifySearchUrl(trackName: string, artistName: string): string {
  const query = `${trackName} ${artistName}`;
  return `https://open.spotify.com/search/${encodeURIComponent(query)}`;
}

export async function getAvailableGenres(): Promise<string[]> {
  const data = await spotifyFetch('/recommendations/available-genre-seeds');
  return data.genres;
}

export function extractLanguageFromTrack(track: SpotifyTrack): string {
  return 'en';
}

export function getReleaseYear(releaseDate: string): number {
  return parseInt(releaseDate.split('-')[0], 10);
}

export function getArtistEra(artist: SpotifyArtist): { start: number; end: number } {
  const currentYear = new Date().getFullYear();
  return {
    start: currentYear - 30,
    end: currentYear,
  };
}
