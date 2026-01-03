import { Link } from 'react-router-dom';
import { getHighResArtwork } from '@/lib/itunes';
import { StarRating } from './StarRating';
import { cn } from '@/lib/utils';

interface SongCardProps {
  songId: string;
  songName: string;
  artistName: string;
  albumName?: string;
  artworkUrl: string;
  rating?: number;
  className?: string;
}

export function SongCard({
  songId,
  songName,
  artistName,
  albumName,
  artworkUrl,
  rating,
  className,
}: SongCardProps) {
  const highResArt = getHighResArtwork(artworkUrl, 300);

  return (
    <Link
      to={`/song/${songId}?name=${encodeURIComponent(songName)}&artist=${encodeURIComponent(artistName)}&album=${encodeURIComponent(albumName || '')}&artwork=${encodeURIComponent(artworkUrl)}`}
      className={cn(
        'group block',
        className
      )}
    >
      <div className="relative overflow-hidden rounded-lg album-art-hover">
        <img
          src={highResArt}
          alt={`${songName} by ${artistName}`}
          className="w-full aspect-square object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        
        {rating !== undefined && (
          <div className="absolute bottom-2 left-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <StarRating rating={rating} size="sm" />
          </div>
        )}
      </div>
      
      <div className="mt-3 space-y-1">
        <h3 className="font-medium text-foreground truncate group-hover:text-primary transition-colors">
          {songName}
        </h3>
        <p className="text-sm text-muted-foreground truncate">
          {artistName}
        </p>
      </div>
    </Link>
  );
}
