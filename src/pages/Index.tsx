import { Link } from 'react-router-dom';
import { ArrowRight, Music, Star, Users, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Navbar } from '@/components/Navbar';
import { ReviewCard } from '@/components/ReviewCard';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

interface ReviewWithProfile {
  id: string;
  song_id: string;
  song_name: string;
  artist_name: string;
  artwork_url: string | null;
  rating: number;
  review_text: string | null;
  created_at: string;
  user_id: string;
  profile?: {
    user_id: string;
    username: string;
    avatar_url: string | null;
  };
}

export default function Index() {
  const { user } = useAuth();

  const { data: recentReviews } = useQuery({
    queryKey: ['recentReviews'],
    queryFn: async (): Promise<ReviewWithProfile[]> => {
      const { data, error } = await supabase
        .from('song_reviews')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(6);

      if (error) throw error;
      if (!data) return [];
      
      const userIds = [...new Set(data.map(r => r.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .in('user_id', userIds);
      
      return data.map(review => ({
        ...review,
        profile: profiles?.find(p => p.user_id === review.user_id)
      }));
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <section className="pt-32 pb-20 px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-glow opacity-50" />
        
        <div className="container mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-8 animate-fade-in">
            <Music className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-primary">Track your music journey</span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold text-foreground mb-6 animate-slide-up">
            Your Personal<br /><span className="text-gradient">Song Diary</span>
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 animate-fade-in">
            Rate, review, and remember every song that moves you. Share your musical journey with friends.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in">
            {user ? (
              <>
                <Link to="/search"><Button variant="glow" size="xl"><Search className="w-5 h-5 mr-2" />Find a Song</Button></Link>
                <Link to={`/profile/${user.id}`}><Button variant="outline" size="xl">View Profile<ArrowRight className="w-5 h-5 ml-2" /></Button></Link>
              </>
            ) : (
              <>
                <Link to="/auth?mode=signup"><Button variant="glow" size="xl">Get Started<ArrowRight className="w-5 h-5 ml-2" /></Button></Link>
                <Link to="/auth"><Button variant="outline" size="xl">Sign In</Button></Link>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="py-20 px-4">
        <div className="container mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: Star, title: 'Rate & Review', description: 'Give every song a rating from 0.5 to 5 stars and write your thoughts.' },
              { icon: Music, title: 'Favorite Four', description: 'Showcase your top 4 songs of all time on your profile.' },
              { icon: Users, title: 'Follow Friends', description: 'See what your friends are listening to and discover new music.' },
            ].map((feature) => (
              <div key={feature.title} className="group p-6 rounded-2xl bg-card border border-border/50 hover:border-primary/30 transition-all duration-300 hover:shadow-card">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {recentReviews && recentReviews.length > 0 && (
        <section className="py-20 px-4">
          <div className="container mx-auto">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Recent Activity</h2>
              <Link to="/activity"><Button variant="ghost">View All<ArrowRight className="w-4 h-4 ml-2" /></Button></Link>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {recentReviews.map((review) => (
                <ReviewCard
                  key={review.id}
                  id={review.id}
                  songId={review.song_id}
                  songName={review.song_name}
                  artistName={review.artist_name}
                  artworkUrl={review.artwork_url || ''}
                  rating={Number(review.rating)}
                  reviewText={review.review_text}
                  createdAt={review.created_at}
                  user={review.profile ? { id: review.profile.user_id, username: review.profile.username, avatarUrl: review.profile.avatar_url } : undefined}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      <footer className="py-8 px-4 border-t border-border/50">
        <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center"><Music className="w-4 h-4 text-primary-foreground" /></div>
            <span className="font-semibold text-foreground">Soundlog</span>
          </div>
          <p className="text-sm text-muted-foreground">© 2024 Soundlog. Track your musical journey.</p>
        </div>
      </footer>
    </div>
  );
}