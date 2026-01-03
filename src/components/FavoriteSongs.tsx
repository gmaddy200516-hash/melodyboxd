import { Link } from 'react-router-dom';
import { getHighResArtwork } from '@/lib/itunes';
import { cn } from '@/lib/utils';

interface FavoriteSong {
  id: string;
  song_id: string;
  song_name: string;
  artist_name: string;
  artwork_url: string;
  position: number;
}

interface FavoriteSongsProps {
  songs: FavoriteSong[];
  className?: string;
}

export function FavoriteSongs({ songs, className }: FavoriteSongsProps) {
  // Sort by position and pad to 4 slots
  const sortedSongs = [...songs].sort((a, b) => a.position - b.position);
  const slots = [1, 2, 3, 4].map((pos) => 
    sortedSongs.find((s) => s.position === pos)
  );

  return (
    <div className={cn('grid grid-cols-4 gap-2 sm:gap-4', className)}>
      {slots.map((song, index) => (
        <div key={index} className="relative">
          {song ? (
            <Link
              to={`/song/${song.song_id}?name=${encodeURIComponent(song.song_name)}&artist=${encodeURIComponent(song.artist_name)}&artwork=${encodeURIComponent(song.artwork_url)}`}
              className="block group"
            >
              <div className="relative overflow-hidden rounded-lg aspect-square album-art-hover">
                <img
                  src={getHighResArtwork(song.artwork_url, 200)}
                  alt={song.song_name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="mt-2 text-xs sm:text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                {song.song_name}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {song.artist_name}
              </p>
            </Link>
          ) : (
            <div className="aspect-square rounded-lg bg-secondary/50 border border-dashed border-border flex items-center justify-center">
              <span className="text-2xl font-bold text-muted-foreground/30">
                {index + 1}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
