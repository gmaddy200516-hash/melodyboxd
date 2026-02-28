import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Heart, Loader2, Edit2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Navbar } from '@/components/Navbar';
import { StarRating } from '@/components/StarRating';
import { ReviewCard } from '@/components/ReviewCard';
import { getHighResArtwork } from '@/lib/itunes';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export default function Song() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const songName = searchParams.get('name') || 'Unknown Song';
  const artistName = searchParams.get('artist') || 'Unknown Artist';
  const albumName = searchParams.get('album') || '';
  const artworkUrl = searchParams.get('artwork') || '';

  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<number | null>(null);

  // Fetch user's existing review
  const { data: existingReview } = useQuery({
    queryKey: ['userReview', id, user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('song_reviews')
        .select('*')
        .eq('song_id', id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!user && !!id,
  });

  interface ReviewWithProfile {
    id: string; song_id: string; song_name: string; artist_name: string;
    artwork_url: string | null; rating: number; review_text: string | null;
    created_at: string; user_id: string;
    profile?: { user_id: string; username: string; avatar_url: string | null; };
  }

  const { data: reviews } = useQuery({
    queryKey: ['songReviews', id],
    queryFn: async (): Promise<ReviewWithProfile[]> => {
      const { data, error } = await supabase
        .from('song_reviews')
        .select('*')
        .eq('song_id', id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!data) return [];
      
      const userIds = [...new Set(data.map(r => r.user_id))];
      const { data: profiles } = await supabase.from('profiles').select('*').in('user_id', userIds);
      
      return data.map(review => ({
        ...review,
        profile: profiles?.find(p => p.user_id === review.user_id)
      }));
    },
    enabled: !!id,
  });

  // Check if song is in favorites
  const { data: favoriteEntry } = useQuery({
    queryKey: ['favoriteSong', id, user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('favorite_songs')
        .select('*')
        .eq('song_id', id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!user && !!id,
  });

  // Set initial values from existing review
  useEffect(() => {
    if (existingReview) {
      setRating(Number(existingReview.rating));
      setReviewText(existingReview.review_text || '');
    }
  }, [existingReview]);

  // Save/update review mutation
  const reviewMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');

      const reviewData = {
        user_id: user.id,
        song_id: id!,
        song_name: songName,
        artist_name: artistName,
        album_name: albumName,
        artwork_url: artworkUrl,
        rating,
        review_text: reviewText || null,
      };

      let reviewId: string;

      if (existingReview) {
        const { error } = await supabase
          .from('song_reviews')
          .update(reviewData)
          .eq('id', existingReview.id);
        if (error) throw error;
        reviewId = existingReview.id;
      } else {
        const { data, error } = await supabase
          .from('song_reviews')
          .insert(reviewData)
          .select('id')
          .single();
        if (error) throw error;
        reviewId = data.id;
      }

      const { analyzeAndStoreSentiment } = await import('@/lib/sentiment-analyzer');
      await analyzeAndStoreSentiment(reviewId, reviewText);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userReview', id, user?.id] });
      queryClient.invalidateQueries({ queryKey: ['songReviews', id] });
      queryClient.invalidateQueries({ queryKey: ['recentReviews'] });
      setIsReviewDialogOpen(false);
      toast({
        title: existingReview ? 'Review updated!' : 'Review saved!',
        description: `Your review for "${songName}" has been saved.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error saving review',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Delete review mutation
  const deleteReviewMutation = useMutation({
    mutationFn: async () => {
      if (!existingReview) return;
      const { error } = await supabase
        .from('song_reviews')
        .delete()
        .eq('id', existingReview.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userReview', id, user?.id] });
      queryClient.invalidateQueries({ queryKey: ['songReviews', id] });
      queryClient.invalidateQueries({ queryKey: ['recentReviews'] });
      setRating(0);
      setReviewText('');
      toast({
        title: 'Review deleted',
        description: 'Your review has been removed.',
      });
    },
  });

  // Add to favorites mutation
  const addFavoriteMutation = useMutation({
    mutationFn: async (position: number) => {
      if (!user) throw new Error('Not authenticated');

      // First remove any existing song at this position
      await supabase
        .from('favorite_songs')
        .delete()
        .eq('user_id', user.id)
        .eq('position', position);

      // Then insert the new favorite
      const { error } = await supabase.from('favorite_songs').insert({
        user_id: user.id,
        song_id: id!,
        song_name: songName,
        artist_name: artistName,
        album_name: albumName,
        artwork_url: artworkUrl,
        position,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favoriteSong', id, user?.id] });
      queryClient.invalidateQueries({ queryKey: ['userFavorites'] });
      setSelectedPosition(null);
      toast({
        title: 'Added to favorites!',
        description: `"${songName}" is now in your top 4.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error adding to favorites',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Remove from favorites mutation
  const removeFavoriteMutation = useMutation({
    mutationFn: async () => {
      if (!favoriteEntry) return;
      const { error } = await supabase
        .from('favorite_songs')
        .delete()
        .eq('id', favoriteEntry.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favoriteSong', id, user?.id] });
      queryClient.invalidateQueries({ queryKey: ['userFavorites'] });
      toast({
        title: 'Removed from favorites',
        description: `"${songName}" has been removed from your top 4.`,
      });
    },
  });

  const handleSaveReview = () => {
    if (rating === 0) {
      toast({
        title: 'Rating required',
        description: 'Please select a rating before saving.',
        variant: 'destructive',
      });
      return;
    }
    reviewMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-24 pb-12 px-4">
        <div className="container mx-auto max-w-4xl">
          {/* Back button */}
          <Button
            variant="ghost"
            className="mb-6"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          {/* Song Header */}
          <div className="flex flex-col md:flex-row gap-8 mb-12">
            {/* Album Art */}
            <div className="flex-shrink-0">
              <img
                src={getHighResArtwork(artworkUrl, 400)}
                alt={songName}
                className="w-full md:w-72 rounded-xl shadow-card"
              />
            </div>

            {/* Song Info */}
            <div className="flex-1">
              <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
                {songName}
              </h1>
              <p className="text-xl text-muted-foreground mb-1">{artistName}</p>
              {albumName && (
                <p className="text-muted-foreground">{albumName}</p>
              )}

              {/* User's rating */}
              {existingReview && (
                <div className="mt-4 flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Your rating:</span>
                  <StarRating rating={Number(existingReview.rating)} size="md" />
                </div>
              )}

              {/* Actions */}
              {user && (
                <div className="flex flex-wrap gap-3 mt-6">
                  <Dialog open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant={existingReview ? 'outline' : 'glow'}>
                        {existingReview ? (
                          <>
                            <Edit2 className="w-4 h-4 mr-2" />
                            Edit Review
                          </>
                        ) : (
                          'Rate & Review'
                        )}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md bg-card border-border">
                      <DialogHeader>
                        <DialogTitle>
                          {existingReview ? 'Edit your review' : 'Rate this song'}
                        </DialogTitle>
                      </DialogHeader>

                      <div className="space-y-6 py-4">
                        <div className="flex flex-col items-center gap-4">
                          <p className="text-sm text-muted-foreground">
                            Click on stars to rate
                          </p>
                          <StarRating
                            rating={rating}
                            size="lg"
                            interactive
                            onRatingChange={setRating}
                          />
                          <span className="text-2xl font-bold text-primary">
                            {rating > 0 ? rating.toFixed(1) : '—'}
                          </span>
                        </div>

                        <div>
                          <Textarea
                            placeholder="Write your thoughts about this song... (optional)"
                            value={reviewText}
                            onChange={(e) => setReviewText(e.target.value)}
                            className="min-h-[120px] bg-secondary/50 border-border/50"
                          />
                        </div>

                        <div className="flex gap-3">
                          <Button
                            variant="glow"
                            className="flex-1"
                            onClick={handleSaveReview}
                            disabled={reviewMutation.isPending}
                          >
                            {reviewMutation.isPending ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              'Save Review'
                            )}
                          </Button>

                          {existingReview && (
                            <Button
                              variant="destructive"
                              onClick={() => deleteReviewMutation.mutate()}
                              disabled={deleteReviewMutation.isPending}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>

                  {/* Favorite button */}
                  {favoriteEntry ? (
                    <Button
                      variant="outline"
                      onClick={() => removeFavoriteMutation.mutate()}
                      disabled={removeFavoriteMutation.isPending}
                    >
                      <Heart className="w-4 h-4 mr-2 fill-primary text-primary" />
                      In Favorites
                    </Button>
                  ) : (
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline">
                          <Heart className="w-4 h-4 mr-2" />
                          Add to Top 4
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-sm bg-card border-border">
                        <DialogHeader>
                          <DialogTitle>Select position</DialogTitle>
                        </DialogHeader>
                        <div className="grid grid-cols-4 gap-3 py-4">
                          {[1, 2, 3, 4].map((pos) => (
                            <Button
                              key={pos}
                              variant={selectedPosition === pos ? 'default' : 'outline'}
                              className="h-16 text-2xl font-bold"
                              onClick={() => setSelectedPosition(pos)}
                            >
                              {pos}
                            </Button>
                          ))}
                        </div>
                        <Button
                          variant="glow"
                          className="w-full"
                          onClick={() => selectedPosition && addFavoriteMutation.mutate(selectedPosition)}
                          disabled={!selectedPosition || addFavoriteMutation.isPending}
                        >
                          {addFavoriteMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            'Confirm'
                          )}
                        </Button>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              )}

              {!user && (
                <p className="mt-6 text-muted-foreground">
                  <Button variant="link" onClick={() => navigate('/auth')} className="p-0">
                    Sign in
                  </Button>{' '}
                  to rate and review this song.
                </p>
              )}
            </div>
          </div>

          {/* Reviews Section */}
          <section>
            <h2 className="text-2xl font-bold text-foreground mb-6">
              Reviews
            </h2>

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
                    user={review.profile ? {
                      id: review.profile.user_id,
                      username: review.profile.username,
                      avatarUrl: review.profile.avatar_url,
                    } : undefined}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p>No reviews yet. Be the first to review this song!</p>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}