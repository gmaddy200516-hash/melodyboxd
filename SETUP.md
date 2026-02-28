# Soundlog - Music Intelligence Platform Setup Guide

## Overview
Soundlog is a sophisticated music intelligence platform that combines collaborative filtering, content-based recommendations, emotional analysis, and social features to provide personalized music recommendations.

## Architecture

### Core Components
1. **Hybrid Recommendation Engine** - Multi-layer algorithm combining:
   - Collaborative Filtering (CF)
   - Content Similarity (Genre matching)
   - Community Emotional Scoring
   - Artist Affinity
   - Language & Era Preferences
   - Social Graph Weighting

2. **Sentiment Analysis** - Rule-based emotion and toxicity detection for reviews

3. **Taste Compatibility** - Mathematical comparison of user preferences

4. **Trending Engine** - Time-decayed engagement scoring

## Prerequisites

- Node.js 18+ and npm
- Supabase account
- Spotify Developer account (for music data)

## Setup Instructions

### 1. Supabase Configuration

The database schema has been created. Make sure your `.env` file contains:

```
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key
```

### 2. Spotify API Setup

1. Go to https://developer.spotify.com/dashboard
2. Create a new app
3. Get your Client ID and Client Secret
4. Add to `.env`:

```
VITE_SPOTIFY_CLIENT_ID=your_client_id
VITE_SPOTIFY_CLIENT_SECRET=your_client_secret
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Run Development Server

```bash
npm run dev
```

### 5. Build for Production

```bash
npm run build
```

## Database Schema

### Core Tables

1. **artists** - Artist metadata with genre, language, and era information
2. **songs** - Song catalog with multi-genre support and rolling popularity
3. **user_preferences** - User taste profile (languages, eras, favorite artists)
4. **song_reviews** - User ratings and review text
5. **review_sentiment** - Sentiment scores, toxicity, and emotion tags
6. **taste_compatibility_cache** - Pre-computed user similarity scores
7. **follows** - Social graph
8. **profiles** - Extended user information

## Algorithm Details

### Recommendation Score Formula

```
Score(u,i) = α·S_genre + β·S_cf + γ·S_com + δ·S_artist + ε·S_lang + ζ·S_era
```

**Default Weights:**
- α (genre) = 0.25
- β (collaborative filtering) = 0.30
- γ (community) = 0.20
- δ (artist) = 0.10
- ε (language) = 0.10
- ζ (era) = 0.05

### Hard Filtering (Stage 1)

Before any scoring, songs are filtered by:
1. User's preferred languages
2. User's preferred eras

This ensures irrelevant content is never recommended.

### Collaborative Filtering (S_cf)

1. Build user-item rating matrix
2. Calculate cosine similarity between users
3. Predict ratings based on similar users
4. Normalize negative similarity to 0
5. Scale to [0, 1] range

### Community Emotional Score (S_com)

```
S_com = Σ(w × λ × r') / Σ(w)
```

Where:
- **w** = Social weight (1.5 for mutual, 1.2 for following, 1.0 default)
- **λ** = Sentiment boost (0 if toxic, 1 + θ·sentiment otherwise)
- **r'** = Time-decayed rating (r × e^(-μΔt))
- **θ** = Sentiment influence (0.2)
- **μ** = Time decay rate (0.1)

### Cold Start Handling

For users with < 5 interactions:
```
Score = Popularity_30d + ArtistMatch + LanguageMatch
```

Complete switch after 5 interactions.

### Trending Algorithm

Last 7 days only:
```
TrendWeight = e^(-0.2 × days)
EngagementScore = Σ(rating × TrendWeight)
```

### Taste Compatibility

```
TasteScore = 0.35·S_cf + 0.25·S_genre + 0.15·S_artist + 0.15·S_lang + 0.10·S_era
```

## Key Features

### User Flow

1. **Onboarding** - Set language, era, and favorite artist preferences
2. **Discover** - Get personalized recommendations or trending songs
3. **Search** - Find songs via Spotify API integration
4. **Review** - Rate songs 0.5-5 stars with optional text
5. **Profile** - Showcase top 4 favorite songs
6. **Social** - Follow users, view activity feed, check taste compatibility

### Sentiment Analysis

Reviews are automatically analyzed for:
- **Sentiment Score** [-1, 1] - Positive/negative sentiment
- **Toxicity Score** [0, 1] - Harmful content detection
- **Emotion Tags** - Joy, sadness, anger, nostalgia, calm, energetic

### Safety Features

1. Toxic reviews (score > 0.5) have zero weight in community scoring
2. All scores bounded to [0, 1] to prevent overflow
3. Division by zero protection throughout
4. Negative cosine similarity clamped to 0
5. No audio streaming (copyright safe - links to Spotify only)

## API Endpoints (Implied by Frontend)

- `GET /recommendations/{userId}` - Personalized song recommendations
- `GET /trending` - Trending songs (last 7 days)
- `GET /users/{userA}/compatibility/{userB}` - Taste compatibility score
- `POST /reviews` - Create/update review with sentiment analysis
- `GET /search/songs?q={query}` - Search via Spotify API
- `GET /search/artists?q={query}` - Artist search

## Performance Considerations

1. **Caching** - Taste compatibility cached for 1 hour
2. **Indexing** - Database indexes on song language, year, genre, popularity
3. **Batching** - Social weights computed in batch per query
4. **Lazy Loading** - Recommendations computed on-demand

## Testing Recommendations

1. Create test users with different taste profiles
2. Add diverse reviews (positive, negative, toxic)
3. Test cold start vs established user recommendations
4. Verify hard filtering works (language/era)
5. Check trending updates daily
6. Validate sentiment scoring accuracy
7. Ensure social weights apply correctly

## Evaluation Metrics

Implement Leave-One-Out validation:
- Precision@10
- Recall@10
- NDCG@10

Compare hybrid vs CF-only to validate improvements.

## Troubleshooting

**No recommendations showing:**
- Check user has set preferences in onboarding
- Verify Spotify API credentials
- Check database has song data

**Sentiment not working:**
- Reviews need text content
- Check review_sentiment table for entries

**Social features not working:**
- Verify follows table has entries
- Check RLS policies allow authenticated access

## Future Enhancements

1. Real sentiment API integration (e.g., Hugging Face)
2. More sophisticated genre embeddings
3. Temporal dynamics (listen time patterns)
4. Playlist generation
5. Artist similarity graphs
6. Advanced evaluation dashboard
7. A/B testing framework

## License

This is a demonstration project showcasing advanced recommendation algorithms.

---

**Note:** This platform does not stream music. It analyzes ratings and provides intelligent recommendations while respecting copyright by linking to external services (Spotify).
