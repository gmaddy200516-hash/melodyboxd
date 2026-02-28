# Soundlog Algorithm Specification

## Table of Contents
1. [System Overview](#system-overview)
2. [Data Model](#data-model)
3. [Recommendation Pipeline](#recommendation-pipeline)
4. [Mathematical Formulas](#mathematical-formulas)
5. [Component Details](#component-details)
6. [Social Features](#social-features)
7. [Safety & Bounds](#safety--bounds)

## System Overview

Soundlog is a **hybrid music intelligence platform** that combines multiple signals to provide personalized song recommendations. Unlike simple content-based or collaborative filtering systems, Soundlog uses a multi-layer approach that considers:

- User taste preferences (genre, language, era, artists)
- Behavioral similarity (collaborative filtering)
- Emotional sentiment from reviews
- Social graph influence
- Temporal trends
- Cold start strategies

## Data Model

### Users & Preferences

```typescript
user_preferences {
  user_id: uuid
  preferred_languages: string[]      // e.g., ['en', 'es', 'fr']
  preferred_eras: {start, end}[]     // e.g., [{start: 1990, end: 1999}]
  favorite_four_artists: uuid[]      // Top 4 artist IDs
  onboarding_completed: boolean
}
```

### Songs & Artists

```typescript
artists {
  id: uuid
  name: string
  primary_genre: string
  language: string
  era_start: integer
  era_end: integer
  spotify_id: string
}

songs {
  id: uuid
  artist_id: uuid
  title: string
  genre: string[]                    // Multiple genres
  language: string
  release_year: integer
  popularity_30d: numeric            // Rolling 30-day average
  spotify_id: string
}
```

### Reviews & Sentiment

```typescript
song_reviews {
  id: uuid
  user_id: uuid
  song_id: uuid
  rating: numeric                    // 1-5 stars (0.5 increments)
  review_text: string?
  created_at: timestamp
}

review_sentiment {
  review_id: uuid
  sentiment_score: numeric           // [-1, 1]
  toxicity_score: numeric            // [0, 1]
  emotion_tags: string[]             // ['joy', 'nostalgia', etc.]
}
```

## Recommendation Pipeline

### Stage 1: Hard Filtering

**Purpose:** Eliminate songs that don't match user's structural preferences

```typescript
function applyHardFilters(songs, preferences) {
  return songs.filter(song => {
    // Language filter
    if (preferences.languages.length > 0) {
      if (!preferences.languages.includes(song.language)) {
        return false;
      }
    }

    // Era filter
    if (preferences.eras.length > 0) {
      const inAnyEra = preferences.eras.some(era =>
        song.release_year >= era.start &&
        song.release_year <= era.end
      );
      if (!inAnyEra) return false;
    }

    return true;
  });
}
```

**Critical:** This is deterministic filtering, not scoring. Songs that fail these checks are completely removed from consideration.

### Stage 2: Hybrid Scoring

**Formula:**

```
Score(u, i) = α·S_genre + β·S_cf + γ·S_com + δ·S_artist + ε·S_lang + ζ·S_era
```

**Default Weights:**
- α = 0.25 (Content similarity - Genre)
- β = 0.30 (Collaborative filtering)
- γ = 0.20 (Community emotion)
- δ = 0.10 (Artist boost)
- ε = 0.10 (Language match)
- ζ = 0.05 (Era score)

**Constraints:**
- All S_* components must be in [0, 1]
- All weights sum to 1.0
- Final score is in [0, 1]

### Stage 3: Ranking & Selection

```typescript
function getRecommendations(userId, limit) {
  const interactionCount = getUserInteractionCount(userId);

  if (interactionCount < 5) {
    return getColdStartRecommendations(userId, limit);
  }

  const candidateSongs = applyHardFilters(allSongs, userPreferences);
  const alreadyRated = getUserRatedSongs(userId);
  const unratedSongs = candidateSongs.filter(s => !alreadyRated.has(s.id));

  const scored = unratedSongs.map(song => ({
    song,
    score: calculateHybridScore(userId, song)
  }));

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.song);
}
```

## Mathematical Formulas

### 1. Content Similarity (S_genre)

**Jaccard Similarity:**

```
S_genre = |G_song ∩ G_user| / |G_song ∪ G_user|
```

Where:
- G_song = Set of genres for the song
- G_user = Set of genres user has rated highly (≥4 stars)

**Implementation:**

```typescript
function calculateGenreScore(songGenres: string[], userGenres: string[]): number {
  if (userGenres.length === 0 || songGenres.length === 0) return 0;

  const intersection = songGenres.filter(g => userGenres.includes(g)).length;
  const union = new Set([...songGenres, ...userGenres]).size;

  return union > 0 ? intersection / union : 0;
}
```

**Range:** [0, 1]

### 2. Collaborative Filtering (S_cf)

**Cosine Similarity:**

```
sim(u, v) = (R_u · R_v) / (||R_u|| · ||R_v||)
```

**Prediction:**

```
pred(u, i) = Σ(sim(u, v) · r_v,i) / Σ(sim(u, v))
```

**Normalization:**

```
S_cf = max(0, min(1, (pred - 0.5) / 4.5))
```

**Implementation:**

```typescript
function calculateCFScore(userId, songId, userRatings): number {
  const similarUsers = getSimilarUsers(userId, songId);

  if (similarUsers.length === 0) return 0.5;

  const validSims = similarUsers
    .map(other => ({
      similarity: max(0, cosineSimilarity(userId, other.userId)),
      rating: other.rating
    }))
    .filter(s => s.similarity > 0);

  if (validSims.length === 0) return 0.5;

  const numerator = sum(validSims.map(s => s.similarity * s.rating));
  const denominator = sum(validSims.map(s => s.similarity));

  if (denominator === 0) return 0.5;

  const prediction = numerator / denominator;
  return max(0, min(1, (prediction - 0.5) / 4.5));
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  const dotProduct = sum(a.map((val, i) => val * b[i]));
  const magA = sqrt(sum(a.map(val => val * val)));
  const magB = sqrt(sum(b.map(val => val * val)));

  if (magA === 0 || magB === 0) return 0;

  // CRITICAL: Cosine can return [-1, 1], we clamp negative to 0
  return max(0, dotProduct / (magA * magB));
}
```

**Range:** [0, 1]

### 3. Community Emotional Score (S_com)

**Time-Decayed Rating:**

```
r'(t) = r · e^(-μΔt)
```

Where:
- r = Original rating
- μ = 0.1 (decay rate)
- Δt = Days since review

**Sentiment Boost:**

```
λ = {
  0                    if toxicity > 0.5
  1 + θ · sentiment    otherwise
}
```

Where:
- θ = 0.2 (sentiment influence)
- sentiment ∈ [-1, 1]

**Social Weight:**

```
w(u, v) = {
  1.5    if mutual follow
  1.2    if u follows v
  1.3    if taste_sim(u, v) > 0.7
  1.0    otherwise
}
```

**Final Score:**

```
S_com = Σ(w · λ · r') / Σ(w)
```

Then normalize by dividing by 5 (max rating).

**Implementation:**

```typescript
function calculateCommunityScore(songId, userId): number {
  const reviews = getSongReviews(songId);

  if (reviews.length === 0) return 0.5;

  const socialWeights = getSocialWeights(userId, reviews.map(r => r.userId));
  const mu = 0.1;
  const theta = 0.2;

  let weightedSum = 0;
  let totalWeight = 0;

  reviews.forEach(review => {
    // Time decay
    const daysSince = (now - review.createdAt) / (1000 * 60 * 60 * 24);
    const timeDecay = Math.exp(-mu * daysSince);
    const decayedRating = review.rating * timeDecay;

    // Sentiment boost
    let sentimentBoost = 1.0;
    const sentiment = review.sentiment;

    if (sentiment && sentiment.toxicity > 0.5) {
      sentimentBoost = 0;  // Toxic reviews have zero weight
    } else if (sentiment) {
      sentimentBoost = 1 + theta * sentiment.score;
    }

    // Social weight
    const weight = socialWeights[review.userId] || 1.0;

    weightedSum += weight * sentimentBoost * decayedRating;
    totalWeight += weight;
  });

  if (totalWeight === 0) return 0.5;

  const communityRating = weightedSum / totalWeight;
  return max(0, min(1, communityRating / 5));
}
```

**Range:** [0, 1]

### 4. Artist Boost (S_artist)

```
S_artist = {
  1    if artist_id ∈ favorite_four_artists
  0    otherwise
}
```

**Range:** {0, 1}

### 5. Language Match (S_lang)

```
S_lang = {
  1    if song.language ∈ preferred_languages
  0    otherwise
}
```

**Range:** {0, 1}

### 6. Era Score (S_era)

For each preferred era:

```
S_era(e) = {
  0                                          if year ∉ [start, end]
  1 - |year - midpoint| / max_range          otherwise
}
```

Where:
- midpoint = (start + end) / 2
- max_range = (end - start) / 2

Final score is maximum across all preferred eras.

**Implementation:**

```typescript
function calculateEraScore(releaseYear, preferredEras): number {
  if (preferredEras.length === 0) return 0.5;

  const scores = preferredEras.map(era => {
    if (releaseYear < era.start || releaseYear > era.end) return 0;

    const midpoint = (era.start + era.end) / 2;
    const maxRange = (era.end - era.start) / 2;

    if (maxRange === 0) return releaseYear === midpoint ? 1 : 0;

    const score = 1 - Math.abs(releaseYear - midpoint) / maxRange;
    return max(0, min(1, score));
  });

  return Math.max(...scores);
}
```

**Range:** [0, 1]

## Component Details

### Cold Start Strategy

**Trigger:** User has < 5 interactions

**Formula:**

```
Score = Popularity_30d + ArtistMatch + LanguageMatch
```

Where:
- Popularity_30d = Average rating in last 30 days
- ArtistMatch = 1 if in favorite_four, else 0
- LanguageMatch = 0.5 if in preferred_languages, else 0

**Critical:** Do NOT mix cold start with hybrid. Use one OR the other.

### Trending Engine

**Time Window:** Last 7 days only

**Time Decay:**

```
TrendWeight(t) = e^(-0.2 · days)
```

**Engagement Score:**

```
Engagement(song) = Σ(rating · TrendWeight(t))
```

**Implementation:**

```typescript
function getTrendingSongs(limit): Song[] {
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const recentReviews = getReviews({ after: sevenDaysAgo });

  const songEngagement = {};

  recentReviews.forEach(review => {
    const daysSince = (now - review.createdAt) / (1000 * 60 * 60 * 24);
    const trendWeight = Math.exp(-0.2 * daysSince);
    const engagement = review.rating * trendWeight;

    songEngagement[review.songId] =
      (songEngagement[review.songId] || 0) + engagement;
  });

  return Object.entries(songEngagement)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([songId]) => getSong(songId));
}
```

### Taste Compatibility

**Purpose:** Measure similarity between two users

**Formula:**

```
TasteScore = 0.35·S_cf + 0.25·S_genre + 0.15·S_artist + 0.15·S_lang + 0.10·S_era
```

**Components:**
- S_cf: Cosine similarity of rating vectors
- S_genre: Jaccard similarity of preferred genres
- S_artist: Jaccard similarity of favorite artists
- S_lang: Jaccard similarity of preferred languages
- S_era: Similarity of era midpoints

**Percentage:** TasteScore × 100

**Caching:** Results cached for 1 hour to reduce computation

## Social Features

### Social Weight Calculation

```typescript
function getSocialWeight(userA, userB): number {
  const isFollowing = follows(userA, userB);
  const isFollower = follows(userB, userA);

  let weight = 1.0;

  if (isFollowing && isFollower) {
    weight = 1.5;  // Mutual
  } else if (isFollowing) {
    weight = 1.2;  // Following
  }

  // Additional boost for taste similarity
  const tasteSim = getTasteCompatibility(userA, userB);
  if (tasteSim > 0.7) {
    weight += 0.3;
  }

  return weight;
}
```

### Activity Feed

Shows reviews from followed users, ordered by recency.

**Query:**

```sql
SELECT r.*, p.username, p.avatar_url
FROM song_reviews r
JOIN profiles p ON r.user_id = p.user_id
WHERE r.user_id IN (
  SELECT following_id FROM follows WHERE follower_id = :current_user
)
ORDER BY r.created_at DESC
LIMIT 50
```

## Safety & Bounds

### Mandatory Constraints

**1. No Negative Cosine Influence**

```typescript
similarity = Math.max(0, cosineSimilarity(a, b));
```

**2. All Scores in [0, 1]**

```typescript
function boundScore(score: number): number {
  return Math.max(0, Math.min(1, score));
}
```

**3. Division by Zero Protection**

```typescript
if (denominator === 0) return defaultValue;
```

**4. No Hybrid + Cold Start Mixing**

```typescript
if (interactionCount < 5) {
  return coldStart();
} else {
  return hybrid();
}
```

**5. Hard Filter Before Scoring**

```typescript
const candidates = applyHardFilters(allSongs);
const scored = candidates.map(calculateScore);
```

### Data Validation

**Reviews:**
- Rating: [0.5, 5.0] in 0.5 increments
- Sentiment: [-1, 1]
- Toxicity: [0, 1]

**Preferences:**
- Languages: Valid ISO codes
- Eras: start ≤ end, reasonable year ranges
- Favorite artists: Must exist in artists table

## What MUST NEVER Break

1. **No negative similarity influence**
2. **No scores outside [0, 1]**
3. **No division by zero**
4. **No hybrid + cold start blending**
5. **No ranking without hard filter**
6. **No algorithm logic in frontend**
7. **No blocking API calls during scoring**
8. **No streaming of copyrighted audio**

## Performance Optimizations

1. **Cache taste compatibility** for 1 hour
2. **Index** song language, year, genre, popularity
3. **Batch** social weight queries
4. **Limit** candidate songs to 1000 before scoring
5. **Lazy load** recommendations on-demand
6. **Precompute** user genre preferences on review insert

## Evaluation Framework

### Metrics

**Precision@K:**
```
Precision@K = (Relevant songs in top K) / K
```

**Recall@K:**
```
Recall@K = (Relevant songs in top K) / (Total relevant songs)
```

**NDCG@K:**
```
NDCG@K = DCG@K / IDCG@K
```

### Leave-One-Out Cross-Validation

```typescript
function evaluateRecommender() {
  const testUsers = getActiveUsers();
  const metrics = [];

  testUsers.forEach(user => {
    const userReviews = getUserReviews(user);

    userReviews.forEach(heldOut => {
      // Remove one review
      const trainSet = userReviews.filter(r => r.id !== heldOut.id);

      // Get recommendations
      const recs = getRecommendations(user, 10);

      // Check if held-out song appears
      const rank = recs.findIndex(s => s.id === heldOut.songId);

      metrics.push({
        hit: rank >= 0,
        rank: rank >= 0 ? rank + 1 : null
      });
    });
  });

  return computeMetrics(metrics);
}
```

---

**Version:** 1.0
**Last Updated:** 2026-02-28
**Algorithm Type:** Multi-Layer Hybrid Recommender System
