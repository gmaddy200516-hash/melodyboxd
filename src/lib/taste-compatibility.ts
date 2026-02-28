import { supabase } from '@/integrations/supabase/client';

export interface CompatibilityResult {
  score: number;
  percentage: number;
  breakdown: {
    cf_score: number;
    genre_score: number;
    artist_score: number;
    language_score: number;
    era_score: number;
  };
}

export class TasteCompatibility {
  async calculateCompatibility(userAId: string, userBId: string): Promise<CompatibilityResult> {
    const cached = await this.getCachedCompatibility(userAId, userBId);
    if (cached) return cached;

    const [cfScore, genreScore, artistScore, languageScore, eraScore] = await Promise.all([
      this.calculateCFSimilarity(userAId, userBId),
      this.calculateGenreSimilarity(userAId, userBId),
      this.calculateArtistOverlap(userAId, userBId),
      this.calculateLanguageOverlap(userAId, userBId),
      this.calculateEraSimilarity(userAId, userBId),
    ]);

    const score =
      0.35 * cfScore +
      0.25 * genreScore +
      0.15 * artistScore +
      0.15 * languageScore +
      0.10 * eraScore;

    const result: CompatibilityResult = {
      score: Math.max(0, Math.min(1, score)),
      percentage: Math.round(score * 100),
      breakdown: {
        cf_score: cfScore,
        genre_score: genreScore,
        artist_score: artistScore,
        language_score: languageScore,
        era_score: eraScore,
      },
    };

    await this.cacheCompatibility(userAId, userBId, result);
    return result;
  }

  private async getCachedCompatibility(userAId: string, userBId: string): Promise<CompatibilityResult | null> {
    const { data } = await supabase
      .from('taste_compatibility_cache')
      .select('*')
      .or(`user_a_id.eq.${userAId},user_a_id.eq.${userBId}`)
      .or(`user_b_id.eq.${userAId},user_b_id.eq.${userBId}`)
      .single();

    if (!data) return null;

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (new Date(data.calculated_at) < oneHourAgo) return null;

    return {
      score: data.compatibility_score,
      percentage: Math.round(data.compatibility_score * 100),
      breakdown: {
        cf_score: data.cf_score,
        genre_score: data.genre_score,
        artist_score: data.artist_score,
        language_score: data.language_score,
        era_score: data.era_score,
      },
    };
  }

  private async cacheCompatibility(userAId: string, userBId: string, result: CompatibilityResult): Promise<void> {
    await supabase
      .from('taste_compatibility_cache')
      .upsert({
        user_a_id: userAId,
        user_b_id: userBId,
        compatibility_score: result.score,
        cf_score: result.breakdown.cf_score,
        genre_score: result.breakdown.genre_score,
        artist_score: result.breakdown.artist_score,
        language_score: result.breakdown.language_score,
        era_score: result.breakdown.era_score,
        calculated_at: new Date().toISOString(),
      });
  }

  private async calculateCFSimilarity(userAId: string, userBId: string): Promise<number> {
    const [ratingsA, ratingsB] = await Promise.all([
      this.getUserRatings(userAId),
      this.getUserRatings(userBId),
    ]);

    if (ratingsA.length === 0 || ratingsB.length === 0) return 0;

    const commonSongs = ratingsA.filter(a =>
      ratingsB.some(b => b.song_id === a.song_id)
    );

    if (commonSongs.length === 0) return 0;

    const vectorA = commonSongs.map(s => s.rating);
    const vectorB = commonSongs.map(s => {
      const match = ratingsB.find(b => b.song_id === s.song_id);
      return match ? match.rating : 0;
    });

    return this.cosineSimilarity(vectorA, vectorB);
  }

  private async calculateGenreSimilarity(userAId: string, userBId: string): Promise<number> {
    const [genresA, genresB] = await Promise.all([
      this.getUserGenres(userAId),
      this.getUserGenres(userBId),
    ]);

    if (genresA.length === 0 || genresB.length === 0) return 0;

    const intersection = genresA.filter(g => genresB.includes(g)).length;
    const union = new Set([...genresA, ...genresB]).size;

    return union > 0 ? intersection / union : 0;
  }

  private async calculateArtistOverlap(userAId: string, userBId: string): Promise<number> {
    const [prefsA, prefsB] = await Promise.all([
      this.getUserPreferences(userAId),
      this.getUserPreferences(userBId),
    ]);

    const artistsA = prefsA.favorite_four_artists || [];
    const artistsB = prefsB.favorite_four_artists || [];

    if (artistsA.length === 0 || artistsB.length === 0) return 0;

    const intersection = artistsA.filter(a => artistsB.includes(a)).length;
    const union = new Set([...artistsA, ...artistsB]).size;

    return union > 0 ? intersection / union : 0;
  }

  private async calculateLanguageOverlap(userAId: string, userBId: string): Promise<number> {
    const [prefsA, prefsB] = await Promise.all([
      this.getUserPreferences(userAId),
      this.getUserPreferences(userBId),
    ]);

    const langsA = prefsA.preferred_languages || [];
    const langsB = prefsB.preferred_languages || [];

    if (langsA.length === 0 || langsB.length === 0) return 0;

    const intersection = langsA.filter(l => langsB.includes(l)).length;
    const union = new Set([...langsA, ...langsB]).size;

    return union > 0 ? intersection / union : 0;
  }

  private async calculateEraSimilarity(userAId: string, userBId: string): Promise<number> {
    const [prefsA, prefsB] = await Promise.all([
      this.getUserPreferences(userAId),
      this.getUserPreferences(userBId),
    ]);

    const erasA = prefsA.preferred_eras || [];
    const erasB = prefsB.preferred_eras || [];

    if (erasA.length === 0 || erasB.length === 0) return 0;

    const midpointA = erasA.reduce((sum, e) => sum + (e.start + e.end) / 2, 0) / erasA.length;
    const midpointB = erasB.reduce((sum, e) => sum + (e.start + e.end) / 2, 0) / erasB.length;

    const maxDiff = 100;
    const diff = Math.abs(midpointA - midpointB);

    return Math.max(0, 1 - diff / maxDiff);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;

    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));

    if (magA === 0 || magB === 0) return 0;

    const similarity = dotProduct / (magA * magB);
    return Math.max(0, Math.min(1, similarity));
  }

  private async getUserRatings(userId: string) {
    const { data } = await supabase
      .from('song_reviews')
      .select('song_id, rating')
      .eq('user_id', userId);

    return data || [];
  }

  private async getUserGenres(userId: string): Promise<string[]> {
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

    return Object.keys(genreFrequency);
  }

  private async getUserPreferences(userId: string) {
    const { data } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    return data || {
      preferred_languages: [],
      preferred_eras: [],
      favorite_four_artists: [],
    };
  }
}

export const tasteCompatibility = new TasteCompatibility();
