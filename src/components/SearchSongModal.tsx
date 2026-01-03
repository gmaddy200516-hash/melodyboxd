import { useState } from 'react';
import { Search, X, Music, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { searchSongs, ITunesSong, getHighResArtwork } from '@/lib/itunes';
import { useDebounce } from '@/hooks/useDebounce';
import { useQuery } from '@tanstack/react-query';

interface SearchSongModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (song: ITunesSong) => void;
  title?: string;
}

export function SearchSongModal({
  open,
  onOpenChange,
  onSelect,
  title = 'Search for a song',
}: SearchSongModalProps) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);

  const { data: songs, isLoading } = useQuery({
    queryKey: ['searchSongs', debouncedQuery],
    queryFn: () => searchSongs(debouncedQuery),
    enabled: debouncedQuery.length > 1,
  });

  const handleSelect = (song: ITunesSong) => {
    onSelect(song);
    setQuery('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">{title}</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by song or artist..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10 bg-secondary/50 border-border/50"
            autoFocus
          />
        </div>

        <div className="max-h-[400px] overflow-y-auto space-y-2">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          )}

          {!isLoading && songs?.length === 0 && query.length > 1 && (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Music className="w-12 h-12 mb-2" />
              <p>No songs found</p>
            </div>
          )}

          {songs?.map((song) => (
            <button
              key={song.trackId}
              onClick={() => handleSelect(song)}
              className="w-full flex items-center gap-3 p-3 rounded-lg bg-secondary/30 hover:bg-secondary transition-colors text-left"
            >
              <img
                src={getHighResArtwork(song.artworkUrl100, 100)}
                alt={song.trackName}
                className="w-12 h-12 rounded-md object-cover"
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">
                  {song.trackName}
                </p>
                <p className="text-sm text-muted-foreground truncate">
                  {song.artistName}
                </p>
              </div>
            </button>
          ))}

          {!query && (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Search className="w-12 h-12 mb-2" />
              <p>Start typing to search</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
