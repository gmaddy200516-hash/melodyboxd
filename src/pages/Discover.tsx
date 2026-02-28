import { useState } from 'react';
import { Loader2, TrendingUp, Sparkles, Users } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { recommendationEngine } from '@/lib/recommendation-engine';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Link, useNavigate } from 'react-router-dom';
import { getHighResArtwork } from '@/lib/itunes';

export default function Discover() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: recommendations, isLoading: recLoading } = useQuery({
    queryKey: ['recommendations', user?.id],
    queryFn: () => recommendationEngine.getRecommendations(user!.id, 20),
    enabled: !!user,
  });

  const { data: trending, isLoading: trendLoading } = useQuery({
    queryKey: ['trending'],
    queryFn: () => recommendationEngine.getTrendingSongs(20),
  });

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-24 text-center px-4">
          <p className="text-muted-foreground mb-4">
            Sign in to get personalized recommendations
          </p>
          <Link to="/auth">
            <Button variant="glow">Sign In</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-24 pb-12 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
              Discover Music
            </h1>
            <p className="text-muted-foreground">
              Personalized recommendations based on your taste
            </p>
          </div>

          <Tabs defaultValue="foryou" className="w-full">
            <TabsList className="bg-secondary/50 mb-6">
              <TabsTrigger value="foryou">
                <Sparkles className="w-4 h-4 mr-2" />
                For You
              </TabsTrigger>
              <TabsTrigger value="trending">
                <TrendingUp className="w-4 h-4 mr-2" />
                Trending
              </TabsTrigger>
            </TabsList>

            <TabsContent value="foryou">
              {recLoading && (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              )}

              {!recLoading && recommendations && recommendations.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-6">
                  {recommendations.map((song, index) => (
                    <div
                      key={song.id}
                      className="group cursor-pointer animate-fade-in"
                      style={{ animationDelay: `${0.05 * index}s` }}
                      onClick={() =>
                        navigate(
                          `/song/${song.id}?name=${encodeURIComponent(
                            song.title
                          )}&artist=${encodeURIComponent(
                            song.artist_name || ''
                          )}&artwork=${encodeURIComponent(song.image_url || '')}`
                        )
                      }
                    >
                      <div className="relative overflow-hidden rounded-lg album-art-hover mb-3">
                        <img
                          src={song.image_url || '/placeholder.svg'}
                          alt={song.title}
                          className="w-full aspect-square object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      </div>
                      <h3 className="font-medium text-foreground truncate group-hover:text-primary transition-colors">
                        {song.title}
                      </h3>
                      <p className="text-sm text-muted-foreground truncate">
                        {song.artist_name}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {!recLoading && (!recommendations || recommendations.length === 0) && (
                <div className="text-center py-20 text-muted-foreground">
                  <Users className="w-16 h-16 mx-auto mb-4" />
                  <p className="text-xl mb-2">No recommendations yet</p>
                  <p className="text-sm mb-6">
                    Rate some songs to get personalized recommendations
                  </p>
                  <Link to="/search">
                    <Button variant="glow">Find Songs to Rate</Button>
                  </Link>
                </div>
              )}
            </TabsContent>

            <TabsContent value="trending">
              {trendLoading && (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              )}

              {!trendLoading && trending && trending.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-6">
                  {trending.map((song, index) => (
                    <div
                      key={song.id}
                      className="group cursor-pointer animate-fade-in"
                      style={{ animationDelay: `${0.05 * index}s` }}
                      onClick={() =>
                        navigate(
                          `/song/${song.id}?name=${encodeURIComponent(
                            song.title
                          )}&artist=${encodeURIComponent(
                            song.artist_name || ''
                          )}&artwork=${encodeURIComponent(song.image_url || '')}`
                        )
                      }
                    >
                      <div className="relative overflow-hidden rounded-lg album-art-hover mb-3">
                        <img
                          src={song.image_url || '/placeholder.svg'}
                          alt={song.title}
                          className="w-full aspect-square object-cover"
                        />
                        <div className="absolute top-2 right-2 bg-primary/90 text-primary-foreground text-xs font-bold px-2 py-1 rounded-full">
                          #{index + 1}
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      </div>
                      <h3 className="font-medium text-foreground truncate group-hover:text-primary transition-colors">
                        {song.title}
                      </h3>
                      <p className="text-sm text-muted-foreground truncate">
                        {song.artist_name}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {!trendLoading && (!trending || trending.length === 0) && (
                <div className="text-center py-20 text-muted-foreground">
                  <TrendingUp className="w-16 h-16 mx-auto mb-4" />
                  <p className="text-xl">No trending songs yet</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
