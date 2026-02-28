import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Music, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { searchArtists, SpotifyArtist } from '@/lib/spotify-api';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { useDebounce } from '@/hooks/useDebounce';

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ar', name: 'Arabic' },
];

const ERAS = [
  { id: '1950s', name: '1950s', start: 1950, end: 1959 },
  { id: '1960s', name: '1960s', start: 1960, end: 1969 },
  { id: '1970s', name: '1970s', start: 1970, end: 1979 },
  { id: '1980s', name: '1980s', start: 1980, end: 1989 },
  { id: '1990s', name: '1990s', start: 1990, end: 1999 },
  { id: '2000s', name: '2000s', start: 2000, end: 2009 },
  { id: '2010s', name: '2010s', start: 2010, end: 2019 },
  { id: '2020s', name: '2020s', start: 2020, end: 2029 },
];

export default function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [selectedEras, setSelectedEras] = useState<string[]>([]);
  const [selectedArtists, setSelectedArtists] = useState<SpotifyArtist[]>([]);
  const [artistQuery, setArtistQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const debouncedArtistQuery = useDebounce(artistQuery, 300);

  const { data: artistResults } = useQuery({
    queryKey: ['searchArtists', debouncedArtistQuery],
    queryFn: () => searchArtists(debouncedArtistQuery, 10),
    enabled: debouncedArtistQuery.length > 1,
  });

  useEffect(() => {
    if (!user) {
      navigate('/auth');
    }
  }, [user, navigate]);

  const toggleLanguage = (code: string) => {
    setSelectedLanguages(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const toggleEra = (id: string) => {
    setSelectedEras(prev =>
      prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]
    );
  };

  const toggleArtist = (artist: SpotifyArtist) => {
    setSelectedArtists(prev => {
      const exists = prev.find(a => a.id === artist.id);
      if (exists) {
        return prev.filter(a => a.id !== artist.id);
      }
      if (prev.length >= 4) {
        toast({
          title: 'Maximum reached',
          description: 'You can only select up to 4 favorite artists',
          variant: 'destructive',
        });
        return prev;
      }
      return [...prev, artist];
    });
  };

  const handleSubmit = async () => {
    if (selectedLanguages.length === 0) {
      toast({
        title: 'Select languages',
        description: 'Please select at least one language',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const erasData = selectedEras.map(eraId => {
        const era = ERAS.find(e => e.id === eraId);
        return { start: era!.start, end: era!.end };
      });

      const artistIds = await Promise.all(
        selectedArtists.map(async artist => {
          const { data: existingArtist } = await supabase
            .from('artists')
            .select('id')
            .eq('spotify_id', artist.id)
            .single();

          if (existingArtist) {
            return existingArtist.id;
          }

          const { data: newArtist, error } = await supabase
            .from('artists')
            .insert({
              name: artist.name,
              spotify_id: artist.id,
              image_url: artist.images[0]?.url || null,
              primary_genre: artist.genres[0] || 'pop',
              language: 'en',
              era_start: new Date().getFullYear() - 20,
              era_end: new Date().getFullYear(),
            })
            .select('id')
            .single();

          if (error) throw error;
          return newArtist.id;
        })
      );

      const { error } = await supabase
        .from('user_preferences')
        .upsert({
          user_id: user!.id,
          preferred_languages: selectedLanguages,
          preferred_eras: erasData,
          favorite_four_artists: artistIds,
          onboarding_completed: true,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      toast({
        title: 'Preferences saved!',
        description: 'Your musical taste profile has been created',
      });

      navigate('/');
    } catch (error: any) {
      toast({
        title: 'Error saving preferences',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-4">
            <Music className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-primary">
              Step {step} of 3
            </span>
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Build Your Music Profile
          </h1>
          <p className="text-muted-foreground">
            Help us understand your musical taste
          </p>
        </div>

        <div className="bg-card rounded-2xl border border-border/50 p-8 shadow-card">
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-4">
                  What languages do you listen to?
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {LANGUAGES.map(lang => (
                    <div
                      key={lang.code}
                      className="flex items-center space-x-2 p-3 rounded-lg bg-secondary/30 hover:bg-secondary transition-colors cursor-pointer"
                      onClick={() => toggleLanguage(lang.code)}
                    >
                      <Checkbox
                        checked={selectedLanguages.includes(lang.code)}
                        onCheckedChange={() => toggleLanguage(lang.code)}
                      />
                      <Label className="cursor-pointer">{lang.name}</Label>
                    </div>
                  ))}
                </div>
              </div>

              <Button
                variant="glow"
                className="w-full"
                onClick={() => setStep(2)}
                disabled={selectedLanguages.length === 0}
              >
                Continue
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-2">
                  Which eras do you prefer?
                </h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Select all that apply
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {ERAS.map(era => (
                    <div
                      key={era.id}
                      className="flex items-center space-x-2 p-3 rounded-lg bg-secondary/30 hover:bg-secondary transition-colors cursor-pointer"
                      onClick={() => toggleEra(era.id)}
                    >
                      <Checkbox
                        checked={selectedEras.includes(era.id)}
                        onCheckedChange={() => toggleEra(era.id)}
                      />
                      <Label className="cursor-pointer">{era.name}</Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  variant="glow"
                  onClick={() => setStep(3)}
                  className="flex-1"
                >
                  Continue
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-2">
                  Pick your top 4 favorite artists
                </h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Selected: {selectedArtists.length}/4
                </p>

                <Input
                  type="search"
                  placeholder="Search for artists..."
                  value={artistQuery}
                  onChange={e => setArtistQuery(e.target.value)}
                  className="mb-4 bg-secondary/50"
                />

                {selectedArtists.length > 0 && (
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {selectedArtists.map(artist => (
                      <div
                        key={artist.id}
                        className="relative p-3 rounded-lg bg-primary/10 border border-primary/30"
                      >
                        <div className="flex items-center gap-3">
                          {artist.images[0] && (
                            <img
                              src={artist.images[0].url}
                              alt={artist.name}
                              className="w-12 h-12 rounded-full object-cover"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">
                              {artist.name}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleArtist(artist)}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {artistResults && artistResults.length > 0 && (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {artistResults.map(artist => {
                      const isSelected = selectedArtists.some(
                        a => a.id === artist.id
                      );
                      return (
                        <div
                          key={artist.id}
                          className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-primary/20 border border-primary'
                              : 'bg-secondary/30 hover:bg-secondary'
                          }`}
                          onClick={() => toggleArtist(artist)}
                        >
                          {artist.images[0] && (
                            <img
                              src={artist.images[0].url}
                              alt={artist.name}
                              className="w-12 h-12 rounded-full object-cover"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{artist.name}</p>
                            <p className="text-sm text-muted-foreground truncate">
                              {artist.genres.slice(0, 2).join(', ')}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setStep(2)}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  variant="glow"
                  onClick={handleSubmit}
                  className="flex-1"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Complete Setup'
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
