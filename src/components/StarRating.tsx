import { Star, StarHalf } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StarRatingProps {
  rating: number;
  maxRating?: number;
  size?: 'sm' | 'md' | 'lg';
  interactive?: boolean;
  onRatingChange?: (rating: number) => void;
  className?: string;
}

export function StarRating({
  rating,
  maxRating = 5,
  size = 'md',
  interactive = false,
  onRatingChange,
  className,
}: StarRatingProps) {
  const sizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-5 h-5',
    lg: 'w-7 h-7',
  };

  const handleClick = (starIndex: number, isHalf: boolean) => {
    if (!interactive || !onRatingChange) return;
    const newRating = isHalf ? starIndex + 0.5 : starIndex + 1;
    onRatingChange(newRating);
  };

  const stars = [];
  for (let i = 0; i < maxRating; i++) {
    const isFilled = rating >= i + 1;
    const isHalfFilled = !isFilled && rating > i && rating < i + 1;
    
    stars.push(
      <div
        key={i}
        className={cn(
          'relative',
          interactive && 'cursor-pointer hover:scale-110 transition-transform'
        )}
        onClick={(e) => {
          if (!interactive) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const isHalf = x < rect.width / 2;
          handleClick(i, isHalf);
        }}
      >
        {isFilled ? (
          <Star
            className={cn(sizeClasses[size], 'fill-gold text-gold')}
          />
        ) : isHalfFilled ? (
          <div className="relative">
            <Star className={cn(sizeClasses[size], 'text-muted-foreground')} />
            <div className="absolute inset-0 overflow-hidden w-1/2">
              <Star className={cn(sizeClasses[size], 'fill-gold text-gold')} />
            </div>
          </div>
        ) : (
          <Star
            className={cn(sizeClasses[size], 'text-muted-foreground')}
          />
        )}
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      {stars}
    </div>
  );
}
