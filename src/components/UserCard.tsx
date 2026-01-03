import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface UserCardProps {
  userId: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  isFollowing?: boolean;
  onFollow?: () => void;
  onUnfollow?: () => void;
  showFollowButton?: boolean;
  className?: string;
}

export function UserCard({
  userId,
  username,
  displayName,
  avatarUrl,
  bio,
  isFollowing,
  onFollow,
  onUnfollow,
  showFollowButton = true,
  className,
}: UserCardProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-4 p-4 bg-card rounded-xl border border-border/50 hover:border-primary/30 transition-all duration-300',
        className
      )}
    >
      <Link to={`/profile/${userId}`} className="flex-shrink-0">
        <div className="w-12 h-12 rounded-full bg-gradient-primary flex items-center justify-center text-lg font-bold text-primary-foreground">
          {username[0].toUpperCase()}
        </div>
      </Link>

      <div className="flex-1 min-w-0">
        <Link to={`/profile/${userId}`}>
          <h3 className="font-semibold text-foreground hover:text-primary transition-colors">
            {displayName || username}
          </h3>
          <p className="text-sm text-muted-foreground">@{username}</p>
        </Link>
        {bio && (
          <p className="text-sm text-foreground/70 mt-1 line-clamp-1">{bio}</p>
        )}
      </div>

      {showFollowButton && (
        <Button
          variant={isFollowing ? 'outline' : 'default'}
          size="sm"
          onClick={isFollowing ? onUnfollow : onFollow}
        >
          {isFollowing ? 'Following' : 'Follow'}
        </Button>
      )}
    </div>
  );
}
