import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search as SearchIcon, Loader2, Music } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Navbar } from '@/components/Navbar';
import { SongCard } from '@/components/SongCard';
import { searchSongs, ITunesSong } from '@/lib/itunes';
import { useDebounce } from '@/hooks/useDebounce';
import { useQuery } from '@tanstack/react-query';

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const [query, setQuery] = useState(initialQuery);
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    if (debouncedQuery) {
      setSearchParams({ q: debouncedQuery });
    } else {
      setSearchParams({});
    }
  }, [debouncedQuery, setSearchParams]);

  const { data: songs, isLoading } = useQuery({
    queryKey: ['searchSongs', debouncedQuery],
    queryFn: () => searchSongs(debouncedQuery),
    enabled: debouncedQuery.length > 1,
  });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-24 pb-12 px-4">
        <div className="container mx-auto max-w-6xl">
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-8">
            Search Songs
          </h1>

          {/* Search Input */}
          <div className="relative max-w-xl mb-8">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search for songs, artists..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-12 h-14 text-lg bg-secondary/50 border-border/50 focus:border-primary"
              autoFocus
            />
          </div>

          {/* Results */}
          {isLoading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          )}

          {!isLoading && songs && songs.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-6">
              {songs.map((song, index) => (
                <div
                  key={song.trackId}
                  className="animate-fade-in"
                  style={{ animationDelay: `${0.05 * index}s` }}
                >
                  <SongCard
                    songId={song.trackId.toString()}
                    songName={song.trackName}
                    artistName={song.artistName}
                    albumName={song.collectionName}
                    artworkUrl={song.artworkUrl100}
                  />
                </div>
              ))}
            </div>
          )}

          {!isLoading && songs && songs.length === 0 && query.length > 1 && (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Music className="w-16 h-16 mb-4" />
              <p className="text-xl">No songs found</p>
              <p className="text-sm mt-2">Try a different search term</p>
            </div>
          )}

          {!query && (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <SearchIcon className="w-16 h-16 mb-4" />
              <p className="text-xl">Search for your favorite songs</p>
              <p className="text-sm mt-2">Find songs to rate and review</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
