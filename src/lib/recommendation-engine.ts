import { supabase } from '@/integrations/supabase/client';

export interface UserPreferences {
  preferred_languages: string[];
  preferred_eras: { start: number; end: number }[];
  favorite_four_artists: string[];
}

export interface Song {
  id: string;
  artist_id: string;
  title: string;
  genre: string[];
  language: string;
  release_year: number;
  popularity_30d: number;
  artist_name?: string;
  image_url?: string;
}

export interface ScoringWeights {
  alpha: number; // genre
  beta: number;  // collaborative filtering
  gamma: number; // community emotion
  delta: number; // artist boost
  epsilon: number; // language match
  zeta: number;  // era score
}

const DEFAULT_WEIGHTS: ScoringWeights = {
  alpha: 0.25,
  beta: 0.30,
  gamma: 0.20,
  delta: 0.10,
  epsilon: 0.10,
  zeta: 0.05,
};

export class RecommendationEngine {
  private weights: ScoringWeights;

  constructor(weights: ScoringWeights = DEFAULT_WEIGHTS) {
    this.weights = weights;
  }

  async getRecommendations(userId: string, limit: number = 20): Promise<Song[]> {
    const interactionCount = await this.getUserInteractionCount(userId);

    if (interactionCount < 5) {
      return this.getColdStartRecommendations(userId, limit);
    }

    return this.getHybridRecommendations(userId, limit);
  }

  private async getUserInteractionCount(userId: string): Promise<number> {
    const { count } = await supabase
      .from('song_reviews')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    return count || 0;
  }

  private async getColdStartRecommendations(userId: string, limit: number): Promise<Song[]> {
    const prefs = await this.getUserPreferences(userId);

    let query = supabase
      .from('songs')
      .select(`
        *,
        artists!inner(name, image_url)
      `);

    if (prefs.preferred_languages.length > 0) {
      query = query.in('language', prefs.preferred_languages);
    }

    const { data: songs, error } = await query
      .order('popularity_30d', { ascending: false })
      .limit(limit * 3);

    if (error) throw error;
    if (!songs) return [];

    const scoredSongs = songs.map(song => {
      let score = song.popularity_30d || 0;

      if (prefs.favorite_four_artists.includes(song.artist_id)) {
        score += 1.0;
      }

      if (prefs.preferred_languages.includes(song.language)) {
        score += 0.5;
      }

      return {
        ...song,
        artist_name: song.artists.name,
        image_url: song.artists.image_url,
        score,
      };
    });

    return scoredSongs
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ score, artists, ...song }) => ({ ...song, artist_name: artists.name, image_url: artists.image_url }));
  }

  private async getHybridRecommendations(userId: string, limit: number): Promise<Song[]> {
    const [prefs, userRatings, userGenres] = await Promise.all([
      this.getUserPreferences(userId),
      this.getUserRatings(userId),
      this.getUserGenrePreferences(userId),
    ]);

    let query = supabase
      .from('songs')
      .select(`
        *,
        artists!inner(name, image_url)
      `);

    if (prefs.preferred_languages.length > 0) {
      query = query.in('language', prefs.preferred_languages);
    }

    if (prefs.preferred_eras.length > 0) {
      const eraFilters = prefs.preferred_eras.map(era =>
        `release_year.gte.${era.start},release_year.lte.${era.end}`
      );
      if (eraFilters.length > 0) {
        query = query.or(eraFilters.join(','));
      }
    }

    const { data: candidateSongs, error } = await query.limit(1000);

    if (error) throw error;
    if (!candidateSongs) return [];

    const alreadyRated = new Set(userRatings.map(r => r.song_id));
    const unratedSongs = candidateSongs.filter(s => !alreadyRated.has(s.id));

    const scoredSongs = await Promise.all(
      unratedSongs.map(async song => {
        const genreScore = this.calculateGenreScore(song.genre, userGenres);
        const cfScore = await this.calculateCFScore(userId, song.id, userRatings);
        const communityScore = await this.calculateCommunityScore(song.id, userId);
        const artistScore = prefs.favorite_four_artists.includes(song.artist_id) ? 1.0 : 0.0;
        const languageScore = prefs.preferred_languages.includes(song.language) ? 1.0 : 0.0;
        const eraScore = this.calculateEraScore(song.release_year, prefs.preferred_eras);

        const finalScore =
          this.weights.alpha * genreScore +
          this.weights.beta * cfScore +
          this.weights.gamma * communityScore +
          this.weights.delta * artistScore +
          this.weights.epsilon * languageScore +
          this.weights.zeta * eraScore;

        return {
          ...song,
          artist_name: song.artists.name,
          image_url: song.artists.image_url,
          score: Math.max(0, Math.min(1, finalScore)),
          components: {
            genre: genreScore,
            cf: cfScore,
            community: communityScore,
            artist: artistScore,
            language: languageScore,
            era: eraScore,
          },
        };
      })
    );

    return scoredSongs
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ score, components, artists, ...song }) => ({ ...song, artist_name: artists.name, image_url: artists.image_url }));
  }

  private calculateGenreScore(songGenres: string[], userGenres: string[]): number {
    if (userGenres.length === 0 || songGenres.length === 0) return 0;

    const intersection = songGenres.filter(g => userGenres.includes(g)).length;
    const union = new Set([...songGenres, ...userGenres]).size;

    return union > 0 ? intersection / union : 0;
  }

  private async calculateCFScore(userId: string, songId: string, userRatings: any[]): Promise<number> {
    const { data: similarUsers } = await supabase
      .from('song_reviews')
      .select('user_id, rating')
      .eq('song_id', songId)
      .neq('user_id', userId);

    if (!similarUsers || similarUsers.length === 0) return 0.5;

    const similarities = await Promise.all(
      similarUsers.map(async other => {
        const sim = await this.calculateUserSimilarity(userId, other.user_id, userRatings);
        return { similarity: Math.max(0, sim), rating: other.rating };
      })
    );

    const validSims = similarities.filter(s => s.similarity > 0);
    if (validSims.length === 0) return 0.5;

    const numerator = validSims.reduce((sum, s) => sum + s.similarity * s.rating, 0);
    const denominator = validSims.reduce((sum, s) => sum + s.similarity, 0);

    if (denominator === 0) return 0.5;

    const prediction = numerator / denominator;
    return Math.max(0, Math.min(1, (prediction - 0.5) / 4.5));
  }

  private async calculateUserSimilarity(userA: string, userB: string, userARatings: any[]): Promise<number> {
    const { data: userBRatings } = await supabase
      .from('song_reviews')
      .select('song_id, rating')
      .eq('user_id', userB);

    if (!userBRatings || userBRatings.length === 0) return 0;

    const commonSongs = userARatings.filter(a =>
      userBRatings.some(b => b.song_id === a.song_id)
    );

    if (commonSongs.length === 0) return 0;

    const ratingsA = commonSongs.map(s => s.rating);
    const ratingsB = commonSongs.map(s => {
      const match = userBRatings.find(b => b.song_id === s.song_id);
      return match ? match.rating : 0;
    });

    return this.cosineSimilarity(ratingsA, ratingsB);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;

    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));

    if (magA === 0 || magB === 0) return 0;
    return dotProduct / (magA * magB);
  }

  private async calculateCommunityScore(songId: string, userId: string): Promise<number> {
    const { data: reviews } = await supabase
      .from('song_reviews')
      .select(`
        rating,
        created_at,
        user_id,
        review_sentiment(sentiment_score, toxicity_score)
      `)
      .eq('song_id', songId);

    if (!reviews || reviews.length === 0) return 0.5;

    const socialWeights = await this.getSocialWeights(userId, reviews.map(r => r.user_id));

    let weightedSum = 0;
    let totalWeight = 0;
    const mu = 0.1;

    reviews.forEach(review => {
      const daysSince = (Date.now() - new Date(review.created_at).getTime()) / (1000 * 60 * 60 * 24);
      const timeDecay = Math.exp(-mu * daysSince);
      const decayedRating = review.rating * timeDecay;

      let sentimentBoost = 1.0;
      const theta = 0.2;

      if (review.review_sentiment && review.review_sentiment.length > 0) {
        const sentiment = review.review_sentiment[0];
        const toxicity = sentiment.toxicity_score || 0;

        if (toxicity > 0.5) {
          sentimentBoost = 0;
        } else {
          sentimentBoost = 1 + theta * (sentiment.sentiment_score || 0);
        }
      }

      const weight = socialWeights[review.user_id] || 1.0;
      weightedSum += weight * sentimentBoost * decayedRating;
      totalWeight += weight;
    });

    if (totalWeight === 0) return 0.5;

    const communityRating = weightedSum / totalWeight;
    return Math.max(0, Math.min(1, communityRating / 5));
  }

  private async getSocialWeights(userId: string, reviewerIds: string[]): Promise<Record<string, number>> {
    const { data: following } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', userId)
      .in('following_id', reviewerIds);

    const { data: followers } = await supabase
      .from('follows')
      .select('follower_id')
      .eq('following_id', userId)
      .in('follower_id', reviewerIds);

    const followingSet = new Set(following?.map(f => f.following_id) || []);
    const followerSet = new Set(followers?.map(f => f.follower_id) || []);

    const weights: Record<string, number> = {};
    reviewerIds.forEach(id => {
      let weight = 1.0;
      const isFollowing = followingSet.has(id);
      const isFollower = followerSet.has(id);

      if (isFollowing && isFollower) {
        weight = 1.5;
      } else if (isFollowing) {
        weight = 1.2;
      }

      weights[id] = weight;
    });

    return weights;
  }

  private calculateEraScore(releaseYear: number, preferredEras: { start: number; end: number }[]): number {
    if (preferredEras.length === 0) return 0.5;

    const scores = preferredEras.map(era => {
      if (releaseYear < era.start || releaseYear > era.end) return 0;

      const midpoint = (era.start + era.end) / 2;
      const maxRange = (era.end - era.start) / 2;

      if (maxRange === 0) return releaseYear === midpoint ? 1 : 0;

      const score = 1 - Math.abs(releaseYear - midpoint) / maxRange;
      return Math.max(0, Math.min(1, score));
    });

    return Math.max(...scores);
  }

  private async getUserPreferences(userId: string): Promise<UserPreferences> {
    const { data } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!data) {
      return {
        preferred_languages: [],
        preferred_eras: [],
        favorite_four_artists: [],
      };
    }

    return {
      preferred_languages: data.preferred_languages || [],
      preferred_eras: data.preferred_eras || [],
      favorite_four_artists: data.favorite_four_artists || [],
    };
  }

  private async getUserRatings(userId: string) {
    const { data } = await supabase
      .from('song_reviews')
      .select('song_id, rating')
      .eq('user_id', userId);

    return data || [];
  }

  private async getUserGenrePreferences(userId: string): Promise<string[]> {
    const { data } = await supabase
      .from('song_reviews')
      .select(`
        song_id,
        rating,
        songs!inner(genre)
      `)
      .eq('user_id', userId)
      .gte('rating', 4);

    if (!data) return [];

    const genreFrequency: Record<string, number> = {};
    data.forEach(review => {
      const genres = review.songs?.genre || [];
      genres.forEach(genre => {
        genreFrequency[genre] = (genreFrequency[genre] || 0) + 1;
      });
    });

    return Object.keys(genreFrequency).sort((a, b) => genreFrequency[b] - genreFrequency[a]);
  }

  async getTrendingSongs(limit: number = 20): Promise<Song[]> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: recentReviews } = await supabase
      .from('song_reviews')
      .select('song_id, rating, created_at')
      .gte('created_at', sevenDaysAgo.toISOString());

    if (!recentReviews) return [];

    const songEngagement: Record<string, number> = {};

    recentReviews.forEach(review => {
      const daysSince = (Date.now() - new Date(review.created_at).getTime()) / (1000 * 60 * 60 * 24);
      const trendWeight = Math.exp(-0.2 * daysSince);
      const engagement = review.rating * trendWeight;

      songEngagement[review.song_id] = (songEngagement[review.song_id] || 0) + engagement;
    });

    const topSongIds = Object.entries(songEngagement)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([id]) => id);

    if (topSongIds.length === 0) return [];

    const { data: songs } = await supabase
      .from('songs')
      .select(`
        *,
        artists!inner(name, image_url)
      `)
      .in('id', topSongIds);

    if (!songs) return [];

    return songs.map(song => ({
      ...song,
      artist_name: song.artists.name,
      image_url: song.artists.image_url,
    }));
  }
}

export const recommendationEngine = new RecommendationEngine();
