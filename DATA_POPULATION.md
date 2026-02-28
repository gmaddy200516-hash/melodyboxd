# Data Population Guide for Soundlog

## Overview

This guide explains how to populate your Soundlog database with initial data from Spotify's API.

## Prerequisites

1. Spotify API credentials configured in `.env`
2. Database schema already created (via migrations)
3. Development server running

## Approach

Since we're using Spotify's API, we can populate data through user interactions:

### Option 1: Organic Growth (Recommended)

1. **Users search for songs** - Search functionality uses Spotify API in real-time
2. **Users rate songs** - When a user rates a song, it's automatically added to the database
3. **Artists are created** - When a song is added, its artist is automatically created if it doesn't exist

This approach ensures:
- Only relevant songs are stored
- Database grows organically based on user interest
- No unnecessary data bloat

### Option 2: Seed Popular Songs

Create a utility script to seed popular songs from specific genres:

```typescript
// src/scripts/seed-popular-songs.ts
import { supabase } from '@/integrations/supabase/client';
import { searchTracks, getArtist } from '@/lib/spotify-api';

async function seedPopularSongs() {
  const genres = ['pop', 'rock', 'hip-hop', 'electronic', 'indie', 'r-n-b'];
  const songsPerGenre = 50;

  for (const genre of genres) {
    console.log(`Seeding ${genre}...`);

    try {
      const tracks = await searchTracks(`genre:${genre}`, songsPerGenre);

      for (const track of tracks) {
        // Get full artist data
        const artist = await getArtist(track.artists[0].id);

        // Insert or get artist
        const { data: existingArtist } = await supabase
          .from('artists')
          .select('id')
          .eq('spotify_id', artist.id)
          .single();

        let artistId: string;

        if (existingArtist) {
          artistId = existingArtist.id;
        } else {
          const { data: newArtist, error } = await supabase
            .from('artists')
            .insert({
              name: artist.name,
              spotify_id: artist.id,
              image_url: artist.images[0]?.url || null,
              primary_genre: artist.genres[0] || genre,
              language: 'en', // Default, would need language detection
              era_start: new Date().getFullYear() - 10,
              era_end: new Date().getFullYear(),
            })
            .select('id')
            .single();

          if (error) {
            console.error('Error creating artist:', error);
            continue;
          }
          artistId = newArtist.id;
        }

        // Insert song
        const releaseYear = parseInt(track.album.release_date.split('-')[0]);

        await supabase
          .from('songs')
          .insert({
            artist_id: artistId,
            title: track.name,
            genre: artist.genres.length > 0 ? artist.genres : [genre],
            language: 'en',
            release_year: releaseYear,
            popularity_30d: track.popularity / 20, // Convert 0-100 to 0-5 scale
            spotify_id: track.id,
          })
          .onConflict('spotify_id')
          .ignore();
      }

      // Rate limit: Wait 1 second between genres
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Error seeding ${genre}:`, error);
    }
  }

  console.log('Seeding complete!');
}

seedPopularSongs();
```

## Automatic Data Creation Flow

### When User Rates a Song

The system automatically:

1. **Checks if artist exists** in database
2. **Creates artist** if not found (from Spotify data)
3. **Checks if song exists** in database
4. **Creates song** if not found (from Spotify data)
5. **Creates review** with rating and text
6. **Analyzes sentiment** of review text
7. **Stores sentiment** in review_sentiment table
8. **Updates popularity** metrics

### When User Sets Favorites

The onboarding flow:

1. **User searches for artists** via Spotify API
2. **Selects 4 favorites** from search results
3. **System creates artist records** if they don't exist
4. **Stores artist IDs** in user_preferences

## Data Consistency

### Artist Data

When creating an artist from Spotify:

```typescript
{
  name: spotifyArtist.name,
  spotify_id: spotifyArtist.id,
  image_url: spotifyArtist.images[0]?.url,
  primary_genre: spotifyArtist.genres[0] || 'pop',
  language: inferLanguage(spotifyArtist), // Default to 'en'
  era_start: currentYear - 20,
  era_end: currentYear
}
```

### Song Data

When creating a song from Spotify:

```typescript
{
  artist_id: artistUuid,
  title: spotifyTrack.name,
  genre: spotifyArtist.genres || ['pop'],
  language: inferLanguage(spotifyTrack),
  release_year: extractYear(spotifyTrack.album.release_date),
  popularity_30d: 0, // Will be updated as reviews come in
  spotify_id: spotifyTrack.id
}
```

## Language Detection

Since Spotify doesn't provide language metadata, use heuristics:

```typescript
function inferLanguage(track: SpotifyTrack): string {
  // Check track name for common patterns
  const trackName = track.name.toLowerCase();
  const artistName = track.artists[0].name.toLowerCase();

  // Simple heuristics (can be improved)
  if (/[가-힣]/.test(trackName)) return 'ko'; // Korean
  if (/[ぁ-ん]|[ァ-ヶ]|[一-龯]/.test(trackName)) return 'ja'; // Japanese
  if (/[а-яё]/i.test(trackName)) return 'ru'; // Russian
  if (/[à-ÿ]/i.test(trackName)) {
    if (track.album.release_date && artistMarket === 'FR') return 'fr';
    if (artistMarket === 'ES') return 'es';
    if (artistMarket === 'PT') return 'pt';
    return 'fr'; // Default for accented characters
  }

  return 'en'; // Default to English
}
```

## Era Calculation

For active artists (no end date known):

```typescript
function calculateArtistEra(artist: SpotifyArtist): { start: number; end: number } {
  const currentYear = new Date().getFullYear();

  // Estimate based on popularity and follower count
  const isLegendary = artist.followers.total > 10_000_000;
  const isEstablished = artist.followers.total > 1_000_000;

  let startYear = currentYear - 5; // Default: Recent artist

  if (isLegendary) {
    startYear = currentYear - 30; // 30-year career
  } else if (isEstablished) {
    startYear = currentYear - 15; // 15-year career
  }

  return {
    start: startYear,
    end: currentYear
  };
}
```

## Updating Popularity Scores

Run this periodically (daily) to update rolling popularity:

```typescript
// Can be run as a scheduled function or manually
async function updateSongPopularity() {
  const { error } = await supabase.rpc('update_song_popularity');

  if (error) {
    console.error('Error updating popularity:', error);
  } else {
    console.log('Popularity scores updated!');
  }
}
```

The `update_song_popularity()` function was created in the migration and calculates:

```sql
UPDATE songs s
SET popularity_30d = (
  SELECT COALESCE(AVG(sr.rating), 0)
  FROM song_reviews sr
  WHERE sr.song_id = s.id::text
  AND sr.created_at > now() - interval '30 days'
);
```

## Test Data Generation

For testing the algorithm with synthetic data:

```typescript
async function generateTestData() {
  const testUsers = 10;
  const reviewsPerUser = 20;

  // Create test users (via auth signup)
  const userIds = [];
  for (let i = 0; i < testUsers; i++) {
    const { data } = await supabase.auth.signUp({
      email: `testuser${i}@soundlog.test`,
      password: 'testpassword123',
    });
    if (data.user) userIds.push(data.user.id);
  }

  // Get random songs
  const { data: songs } = await supabase
    .from('songs')
    .select('id')
    .limit(100);

  if (!songs) return;

  // Create reviews with varied ratings
  for (const userId of userIds) {
    const userTaste = Math.random(); // 0-1, determines if user rates high or low

    for (let i = 0; i < reviewsPerUser; i++) {
      const song = songs[Math.floor(Math.random() * songs.length)];

      // Users with similar taste values will rate similarly
      const baseRating = userTaste > 0.5 ? 4 : 2;
      const variance = (Math.random() - 0.5) * 2;
      const rating = Math.max(1, Math.min(5, baseRating + variance));

      await supabase.from('song_reviews').insert({
        user_id: userId,
        song_id: song.id,
        rating: Math.round(rating * 2) / 2, // Round to 0.5
        review_text: generateRandomReview(rating),
      });
    }
  }

  console.log('Test data generated!');
}

function generateRandomReview(rating: number): string {
  if (rating >= 4) {
    return ['Amazing song!', 'Love this track', 'Incredible music'][Math.floor(Math.random() * 3)];
  } else if (rating >= 2.5) {
    return ['Pretty good', 'Not bad', 'Decent song'][Math.floor(Math.random() * 3)];
  } else {
    return ['Not my favorite', 'Could be better', 'Not feeling it'][Math.floor(Math.random() * 3)];
  }
}
```

## Data Quality Checks

Run these queries to verify data integrity:

```sql
-- Check for orphaned songs (no artist)
SELECT COUNT(*) FROM songs WHERE artist_id NOT IN (SELECT id FROM artists);

-- Check for songs without genres
SELECT COUNT(*) FROM songs WHERE genre = '{}' OR genre IS NULL;

-- Check popularity distribution
SELECT
  FLOOR(popularity_30d) as rating,
  COUNT(*) as count
FROM songs
GROUP BY FLOOR(popularity_30d)
ORDER BY rating;

-- Check review sentiment coverage
SELECT
  COUNT(DISTINCT sr.id) as total_reviews,
  COUNT(DISTINCT rs.review_id) as with_sentiment,
  (COUNT(DISTINCT rs.review_id)::float / COUNT(DISTINCT sr.id) * 100) as coverage_pct
FROM song_reviews sr
LEFT JOIN review_sentiment rs ON sr.id = rs.review_id;
```

## Production Considerations

1. **Rate Limiting** - Spotify API has rate limits, implement exponential backoff
2. **Caching** - Cache artist/song data for 24 hours before re-fetching
3. **Batch Processing** - Process data imports in batches to avoid timeouts
4. **Error Handling** - Log failures and retry failed imports
5. **Monitoring** - Track data growth and quality metrics

## Maintenance Tasks

### Daily
- Update `popularity_30d` scores
- Clean up old cache entries

### Weekly
- Review sentiment analysis accuracy
- Check for duplicate artists/songs

### Monthly
- Analyze recommendation quality metrics
- Update artist era information for new releases

---

**Note:** The system is designed to work with real user interactions. The more authentic data you have, the better the recommendations will be. Start with real users and let the database grow organically!
