import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Edit2, Loader2, UserPlus, UserMinus, Music } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Navbar } from '@/components/Navbar';
import { FavoriteSongs } from '@/components/FavoriteSongs';
import { ReviewCard } from '@/components/ReviewCard';
import { SearchSongModal } from '@/components/SearchSongModal';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ITunesSong } from '@/lib/itunes';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function Profile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editData, setEditData] = useState({ display_name: '', bio: '' });
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<number | null>(null);

  const isOwnProfile = user?.id === id;

  // Fetch profile
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch favorite songs
  const { data: favorites } = useQuery({
    queryKey: ['userFavorites', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('favorite_songs')
        .select('*')
        .eq('user_id', id)
        .order('position');

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch user's reviews
  const { data: reviews } = useQuery({
    queryKey: ['userReviews', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('song_reviews')
        .select('*')
        .eq('user_id', id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch follower/following counts
  const { data: followStats } = useQuery({
    queryKey: ['followStats', id],
    queryFn: async () => {
      const [followers, following] = await Promise.all([
        supabase
          .from('follows')
          .select('*', { count: 'exact', head: true })
          .eq('following_id', id),
        supabase
          .from('follows')
          .select('*', { count: 'exact', head: true })
          .eq('follower_id', id),
      ]);

      return {
        followers: followers.count || 0,
        following: following.count || 0,
      };
    },
    enabled: !!id,
  });

  // Check if current user is following this profile
  const { data: isFollowing } = useQuery({
    queryKey: ['isFollowing', user?.id, id],
    queryFn: async () => {
      if (!user) return false;
      const { data, error } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', user.id)
        .eq('following_id', id)
        .maybeSingle();

      if (error) throw error;
      return !!data;
    },
    enabled: !!user && !!id && !isOwnProfile,
  });

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: editData.display_name || null,
          bio: editData.bio || null,
        })
        .eq('user_id', user!.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', id] });
      setIsEditDialogOpen(false);
      toast({ title: 'Profile updated!' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error updating profile',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Follow/unfollow mutations
  const followMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase.from('follows').insert({
        follower_id: user.id,
        following_id: id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['isFollowing', user?.id, id] });
      queryClient.invalidateQueries({ queryKey: ['followStats', id] });
      toast({ title: `Following ${profile?.username}` });
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('following_id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['isFollowing', user?.id, id] });
      queryClient.invalidateQueries({ queryKey: ['followStats', id] });
      toast({ title: `Unfollowed ${profile?.username}` });
    },
  });

  // Add favorite song mutation
  const addFavoriteMutation = useMutation({
    mutationFn: async (song: ITunesSong) => {
      if (!user || !selectedPosition) throw new Error('Invalid data');

      // Remove any existing song at this position
      await supabase
        .from('favorite_songs')
        .delete()
        .eq('user_id', user.id)
        .eq('position', selectedPosition);

      // Also remove if this song is already a favorite
      await supabase
        .from('favorite_songs')
        .delete()
        .eq('user_id', user.id)
        .eq('song_id', song.trackId.toString());

      const { error } = await supabase.from('favorite_songs').insert({
        user_id: user.id,
        song_id: song.trackId.toString(),
        song_name: song.trackName,
        artist_name: song.artistName,
        album_name: song.collectionName,
        artwork_url: song.artworkUrl100,
        position: selectedPosition,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userFavorites', id] });
      setSelectedPosition(null);
      toast({ title: 'Favorite song updated!' });
    },
  });

  if (profileLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-24 text-center text-muted-foreground">
          <p>User not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-24 pb-12 px-4">
        <div className="container mx-auto max-w-4xl">
          {/* Profile Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 mb-8">
            {/* Avatar */}
            <div className="w-24 h-24 rounded-full bg-gradient-primary flex items-center justify-center text-4xl font-bold text-primary-foreground shadow-glow">
              {profile.username[0].toUpperCase()}
            </div>

            {/* Info */}
            <div className="flex-1">
              <div className="flex items-center gap-4 mb-2">
                <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
                  {profile.display_name || profile.username}
                </h1>
                {isOwnProfile && (
                  <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditData({
                          display_name: profile.display_name || '',
                          bio: profile.bio || '',
                        })}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-card border-border">
                      <DialogHeader>
                        <DialogTitle>Edit Profile</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div>
                          <label className="text-sm font-medium text-foreground">
                            Display Name
                          </label>
                          <Input
                            value={editData.display_name}
                            onChange={(e) =>
                              setEditData((prev) => ({
                                ...prev,
                                display_name: e.target.value,
                              }))
                            }
                            className="mt-1 bg-secondary/50"
                            placeholder={profile.username}
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-foreground">
                            Bio
                          </label>
                          <Textarea
                            value={editData.bio}
                            onChange={(e) =>
                              setEditData((prev) => ({
                                ...prev,
                                bio: e.target.value,
                              }))
                            }
                            className="mt-1 bg-secondary/50"
                            placeholder="Tell us about yourself..."
                          />
                        </div>
                        <Button
                          variant="glow"
                          className="w-full"
                          onClick={() => updateProfileMutation.mutate()}
                          disabled={updateProfileMutation.isPending}
                        >
                          {updateProfileMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            'Save Changes'
                          )}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>

              <p className="text-muted-foreground">@{profile.username}</p>

              {profile.bio && (
                <p className="text-foreground/80 mt-2">{profile.bio}</p>
              )}

              {/* Stats */}
              <div className="flex items-center gap-6 mt-4">
                <div className="text-center">
                  <p className="text-xl font-bold text-foreground">
                    {reviews?.length || 0}
                  </p>
                  <p className="text-sm text-muted-foreground">Reviews</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-foreground">
                    {followStats?.followers || 0}
                  </p>
                  <p className="text-sm text-muted-foreground">Followers</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-foreground">
                    {followStats?.following || 0}
                  </p>
                  <p className="text-sm text-muted-foreground">Following</p>
                </div>
              </div>
            </div>

            {/* Follow button */}
            {!isOwnProfile && user && (
              <Button
                variant={isFollowing ? 'outline' : 'glow'}
                onClick={() =>
                  isFollowing ? unfollowMutation.mutate() : followMutation.mutate()
                }
                disabled={followMutation.isPending || unfollowMutation.isPending}
              >
                {isFollowing ? (
                  <>
                    <UserMinus className="w-4 h-4 mr-2" />
                    Unfollow
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Follow
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Favorite Songs */}
          <section className="mb-12">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-foreground">
                Favorite Songs
              </h2>
              {isOwnProfile && (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <Edit2 className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-card border-border">
                    <DialogHeader>
                      <DialogTitle>Edit Favorite Songs</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground mb-4">
                      Select a position, then search for a song
                    </p>
                    <div className="grid grid-cols-4 gap-3 mb-4">
                      {[1, 2, 3, 4].map((pos) => (
                        <Button
                          key={pos}
                          variant={selectedPosition === pos ? 'default' : 'outline'}
                          className="h-16 text-2xl font-bold"
                          onClick={() => {
                            setSelectedPosition(pos);
                            setIsSearchOpen(true);
                          }}
                        >
                          {pos}
                        </Button>
                      ))}
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>

            <FavoriteSongs songs={favorites || []} />
          </section>

          {/* Reviews Tab */}
          <Tabs defaultValue="reviews">
            <TabsList className="bg-secondary/50 mb-6">
              <TabsTrigger value="reviews">Reviews</TabsTrigger>
            </TabsList>

            <TabsContent value="reviews">
              {reviews && reviews.length > 0 ? (
                <div className="space-y-4">
                  {reviews.map((review) => (
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
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Music className="w-12 h-12 mx-auto mb-4" />
                  <p>No reviews yet</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <SearchSongModal
        open={isSearchOpen}
        onOpenChange={setIsSearchOpen}
        onSelect={(song) => addFavoriteMutation.mutate(song)}
        title={`Select song for position ${selectedPosition}`}
      />
    </div>
  );
}
