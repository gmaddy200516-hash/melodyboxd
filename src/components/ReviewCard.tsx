import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { getHighResArtwork } from '@/lib/itunes';
import { StarRating } from './StarRating';
import { cn } from '@/lib/utils';

interface ReviewCardProps {
  id: string;
  songId: string;
  songName: string;
  artistName: string;
  artworkUrl: string;
  rating: number;
  reviewText?: string | null;
  createdAt: string;
  user?: {
    id: string;
    username: string;
    avatarUrl?: string | null;
  };
  className?: string;
}

export function ReviewCard({
  songId,
  songName,
  artistName,
  artworkUrl,
  rating,
  reviewText,
  createdAt,
  user,
  className,
}: ReviewCardProps) {
  const highResArt = getHighResArtwork(artworkUrl, 200);

  return (
    <div
      className={cn(
        'group bg-card rounded-xl p-4 border border-border/50 hover:border-primary/30 transition-all duration-300 hover:shadow-card',
        className
      )}
    >
      <div className="flex gap-4">
        {/* Album Art */}
        <Link
          to={`/song/${songId}?name=${encodeURIComponent(songName)}&artist=${encodeURIComponent(artistName)}&artwork=${encodeURIComponent(artworkUrl)}`}
          className="flex-shrink-0"
        >
          <img
            src={highResArt}
            alt={songName}
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg object-cover album-art-hover"
          />
        </Link>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* User info */}
          {user && (
            <Link
              to={`/profile/${user.id}`}
              className="flex items-center gap-2 mb-2 group/user"
            >
              <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-secondary-foreground">
                {user.username[0].toUpperCase()}
              </div>
              <span className="text-sm font-medium text-muted-foreground group-hover/user:text-primary transition-colors">
                {user.username}
              </span>
            </Link>
          )}

          {/* Song info */}
          <Link
            to={`/song/${songId}?name=${encodeURIComponent(songName)}&artist=${encodeURIComponent(artistName)}&artwork=${encodeURIComponent(artworkUrl)}`}
          >
            <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
              {songName}
            </h3>
            <p className="text-sm text-muted-foreground truncate">
              {artistName}
            </p>
          </Link>

          {/* Rating and time */}
          <div className="flex items-center gap-3 mt-2">
            <StarRating rating={rating} size="sm" />
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
            </span>
          </div>

          {/* Review text */}
          {reviewText && (
            <p className="mt-3 text-sm text-foreground/80 line-clamp-2">
              {reviewText}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
