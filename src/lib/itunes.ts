export interface ITunesSong {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName: string;
  artworkUrl100: string;
  artworkUrl60: string;
  previewUrl?: string;
  trackTimeMillis?: number;
  releaseDate: string;
  primaryGenreName: string;
}

export interface SearchResult {
  resultCount: number;
  results: ITunesSong[];
}

export async function searchSongs(query: string): Promise<ITunesSong[]> {
  if (!query.trim()) return [];
  
  const encodedQuery = encodeURIComponent(query.trim());
  const response = await fetch(
    `https://itunes.apple.com/search?term=${encodedQuery}&media=music&entity=song&limit=20`
  );
  
  if (!response.ok) {
    throw new Error('Failed to search songs');
  }
  
  const data: SearchResult = await response.json();
  return data.results;
}

export function getHighResArtwork(url: string, size: number = 500): string {
  return url.replace('100x100', `${size}x${size}`);
}

export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatReleaseYear(dateString: string): string {
  return new Date(dateString).getFullYear().toString();
}
