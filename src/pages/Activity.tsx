import { Loader2, Music, Users } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { ReviewCard } from '@/components/ReviewCard';
import { UserCard } from '@/components/UserCard';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function Activity() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  interface ReviewWithProfile {
    id: string; song_id: string; song_name: string; artist_name: string;
    artwork_url: string | null; rating: number; review_text: string | null;
    created_at: string; user_id: string;
    profile?: { user_id: string; username: string; avatar_url: string | null; };
  }

  const { data: activityReviews, isLoading: activityLoading } = useQuery({
    queryKey: ['activityFeed', user?.id],
    queryFn: async (): Promise<ReviewWithProfile[]> => {
      if (!user) return [];

      const { data: follows, error: followsError } = await supabase
        .from('follows').select('following_id').eq('follower_id', user.id);

      if (followsError) throw followsError;
      const followedIds = follows.map((f) => f.following_id);
      if (followedIds.length === 0) return [];

      const { data: reviews, error: reviewsError } = await supabase
        .from('song_reviews').select('*').in('user_id', followedIds)
        .order('created_at', { ascending: false }).limit(50);

      if (reviewsError) throw reviewsError;
      if (!reviews) return [];
      
      const userIds = [...new Set(reviews.map(r => r.user_id))];
      const { data: profiles } = await supabase.from('profiles').select('*').in('user_id', userIds);
      
      return reviews.map(review => ({
        ...review,
        profile: profiles?.find(p => p.user_id === review.user_id)
      }));
    },
    enabled: !!user,
  });

  // Fetch users to discover (not following yet)
  const { data: discoverUsers, isLoading: discoverLoading } = useQuery({
    queryKey: ['discoverUsers', user?.id],
    queryFn: async () => {
      if (!user) return [];

      // Get users the current user follows
      const { data: follows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id);

      const followedIds = follows?.map((f) => f.following_id) || [];
      followedIds.push(user.id); // Exclude self

      // Get users not in that list
      const { data: users, error } = await supabase
        .from('profiles')
        .select('*')
        .not('user_id', 'in', `(${followedIds.join(',')})`)
        .limit(10);

      if (error) throw error;
      return users;
    },
    enabled: !!user,
  });

  // Check follow status for discover users
  const { data: followStatus } = useQuery({
    queryKey: ['followStatus', user?.id, discoverUsers?.map((u) => u.user_id)],
    queryFn: async () => {
      if (!user || !discoverUsers) return {};

      const { data } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id);

      const status: Record<string, boolean> = {};
      discoverUsers.forEach((u) => {
        status[u.user_id] = data?.some((f) => f.following_id === u.user_id) || false;
      });
      return status;
    },
    enabled: !!user && !!discoverUsers,
  });

  // Follow mutation
  const followMutation = useMutation({
    mutationFn: async (userId: string) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase.from('follows').insert({
        follower_id: user.id,
        following_id: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['followStatus'] });
      queryClient.invalidateQueries({ queryKey: ['activityFeed'] });
      queryClient.invalidateQueries({ queryKey: ['discoverUsers'] });
      toast({ title: 'Followed!' });
    },
  });

  // Unfollow mutation
  const unfollowMutation = useMutation({
    mutationFn: async (userId: string) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('following_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['followStatus'] });
      queryClient.invalidateQueries({ queryKey: ['activityFeed'] });
      toast({ title: 'Unfollowed' });
    },
  });

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-24 text-center">
          <p className="text-muted-foreground mb-4">
            Sign in to see activity from people you follow
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
        <div className="container mx-auto max-w-4xl">
          <h1 className="text-3xl font-bold text-foreground mb-8">Activity</h1>

          <Tabs defaultValue="feed">
            <TabsList className="bg-secondary/50 mb-6">
              <TabsTrigger value="feed">Following</TabsTrigger>
              <TabsTrigger value="discover">Discover</TabsTrigger>
            </TabsList>

            <TabsContent value="feed">
              {activityLoading && (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              )}

              {!activityLoading && activityReviews && activityReviews.length > 0 && (
                <div className="space-y-4">
                  {activityReviews.map((review) => (
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
                      user={review.profile ? {
                        id: review.profile.user_id,
                        username: review.profile.username,
                        avatarUrl: review.profile.avatar_url,
                      } : undefined}
                    />
                  ))}
                </div>
              )}

              {!activityLoading && (!activityReviews || activityReviews.length === 0) && (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-4" />
                  <p className="text-lg mb-2">No activity yet</p>
                  <p className="text-sm">Follow some users to see their reviews here</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="discover">
              {discoverLoading && (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              )}

              {!discoverLoading && discoverUsers && discoverUsers.length > 0 && (
                <div className="space-y-4">
                  {discoverUsers.map((profile) => (
                    <UserCard
                      key={profile.user_id}
                      userId={profile.user_id}
                      username={profile.username}
                      displayName={profile.display_name}
                      avatarUrl={profile.avatar_url}
                      bio={profile.bio}
                      isFollowing={followStatus?.[profile.user_id] || false}
                      onFollow={() => followMutation.mutate(profile.user_id)}
                      onUnfollow={() => unfollowMutation.mutate(profile.user_id)}
                    />
                  ))}
                </div>
              )}

              {!discoverLoading && (!discoverUsers || discoverUsers.length === 0) && (
                <div className="text-center py-12 text-muted-foreground">
                  <Music className="w-12 h-12 mx-auto mb-4" />
                  <p className="text-lg">No new users to discover</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}