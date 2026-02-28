/*
  # Comprehensive Music Intelligence Platform Schema
  
  ## New Tables
  
  ### `artists`
  - `id` (uuid, primary key)
  - `name` (text, unique)
  - `image_url` (text)
  - `primary_genre` (text)
  - `language` (text)
  - `era_start` (integer) - Start year of artist's era
  - `era_end` (integer) - End year of artist's era
  - `spotify_id` (text) - For external linking
  - `popularity_score` (numeric) - Base popularity
  - `created_at` (timestamptz)
  
  ### `songs`
  - `id` (uuid, primary key)
  - `artist_id` (uuid, foreign key)
  - `title` (text)
  - `genre` (text array) - Multiple genres per song
  - `language` (text)
  - `release_year` (integer)
  - `popularity_30d` (numeric) - Rolling 30-day popularity
  - `spotify_id` (text) - For external linking
  - `created_at` (timestamptz)
  
  ### `user_preferences`
  - `user_id` (uuid, primary key)
  - `preferred_languages` (jsonb) - Array of language codes
  - `preferred_eras` (jsonb) - Array of {start, end} objects
  - `favorite_four_artists` (jsonb) - Array of artist IDs
  - `onboarding_completed` (boolean)
  - `updated_at` (timestamptz)
  
  ### `review_sentiment`
  - `review_id` (uuid, foreign key to song_reviews)
  - `sentiment_score` (numeric) - Range [-1, 1]
  - `toxicity_score` (numeric) - Range [0, 1]
  - `emotion_tags` (jsonb) - Array of detected emotions
  - `processed_at` (timestamptz)
  
  ### `taste_compatibility_cache`
  - `user_a_id` (uuid)
  - `user_b_id` (uuid)
  - `compatibility_score` (numeric) - Range [0, 1]
  - `cf_score` (numeric)
  - `genre_score` (numeric)
  - `artist_score` (numeric)
  - `language_score` (numeric)
  - `era_score` (numeric)
  - `calculated_at` (timestamptz)
  - PRIMARY KEY (user_a_id, user_b_id)
  
  ### `recommendation_metrics`
  - `id` (uuid, primary key)
  - `user_id` (uuid)
  - `song_id` (uuid)
  - `algorithm_version` (text)
  - `score` (numeric)
  - `score_components` (jsonb) - Breakdown of all components
  - `was_interacted` (boolean)
  - `interaction_type` (text) - 'rated', 'skipped', 'ignored'
  - `created_at` (timestamptz)
  
  ## Modified Tables
  - Update `song_reviews` to support the new system
  - Update `profiles` to include interaction counts
  
  ## Security
  - Enable RLS on all tables
  - Create policies for authenticated access
*/

-- Artists table
CREATE TABLE IF NOT EXISTS artists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  image_url text,
  primary_genre text NOT NULL,
  language text NOT NULL,
  era_start integer NOT NULL,
  era_end integer NOT NULL,
  spotify_id text UNIQUE,
  popularity_score numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE artists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Artists are viewable by everyone"
  ON artists FOR SELECT
  TO authenticated
  USING (true);

-- Songs table
CREATE TABLE IF NOT EXISTS songs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid REFERENCES artists(id) ON DELETE CASCADE,
  title text NOT NULL,
  genre text[] NOT NULL DEFAULT '{}',
  language text NOT NULL,
  release_year integer NOT NULL,
  popularity_30d numeric DEFAULT 0,
  spotify_id text UNIQUE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE songs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Songs are viewable by everyone"
  ON songs FOR SELECT
  TO authenticated
  USING (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_songs_artist_id ON songs(artist_id);
CREATE INDEX IF NOT EXISTS idx_songs_language ON songs(language);
CREATE INDEX IF NOT EXISTS idx_songs_release_year ON songs(release_year);
CREATE INDEX IF NOT EXISTS idx_songs_genre ON songs USING gin(genre);
CREATE INDEX IF NOT EXISTS idx_songs_popularity ON songs(popularity_30d DESC);

-- User preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id uuid PRIMARY KEY,
  preferred_languages jsonb DEFAULT '[]'::jsonb,
  preferred_eras jsonb DEFAULT '[]'::jsonb,
  favorite_four_artists jsonb DEFAULT '[]'::jsonb,
  onboarding_completed boolean DEFAULT false,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own preferences"
  ON user_preferences FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
  ON user_preferences FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
  ON user_preferences FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Review sentiment table
CREATE TABLE IF NOT EXISTS review_sentiment (
  review_id uuid PRIMARY KEY REFERENCES song_reviews(id) ON DELETE CASCADE,
  sentiment_score numeric NOT NULL CHECK (sentiment_score >= -1 AND sentiment_score <= 1),
  toxicity_score numeric NOT NULL CHECK (toxicity_score >= 0 AND toxicity_score <= 1),
  emotion_tags jsonb DEFAULT '[]'::jsonb,
  processed_at timestamptz DEFAULT now()
);

ALTER TABLE review_sentiment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sentiment is viewable by everyone"
  ON review_sentiment FOR SELECT
  TO authenticated
  USING (true);

-- Taste compatibility cache
CREATE TABLE IF NOT EXISTS taste_compatibility_cache (
  user_a_id uuid NOT NULL,
  user_b_id uuid NOT NULL,
  compatibility_score numeric NOT NULL CHECK (compatibility_score >= 0 AND compatibility_score <= 1),
  cf_score numeric NOT NULL CHECK (cf_score >= 0 AND cf_score <= 1),
  genre_score numeric NOT NULL CHECK (genre_score >= 0 AND genre_score <= 1),
  artist_score numeric NOT NULL CHECK (artist_score >= 0 AND artist_score <= 1),
  language_score numeric NOT NULL CHECK (language_score >= 0 AND language_score <= 1),
  era_score numeric NOT NULL CHECK (era_score >= 0 AND era_score <= 1),
  calculated_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_a_id, user_b_id)
);

ALTER TABLE taste_compatibility_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their compatibility scores"
  ON taste_compatibility_cache FOR SELECT
  TO authenticated
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

-- Recommendation metrics (for evaluation)
CREATE TABLE IF NOT EXISTS recommendation_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  song_id uuid NOT NULL,
  algorithm_version text NOT NULL,
  score numeric NOT NULL CHECK (score >= 0 AND score <= 1),
  score_components jsonb NOT NULL,
  was_interacted boolean DEFAULT false,
  interaction_type text CHECK (interaction_type IN ('rated', 'skipped', 'ignored')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE recommendation_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own metrics"
  ON recommendation_metrics FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_metrics_user_created ON recommendation_metrics(user_id, created_at DESC);

-- Add interaction count to profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'interaction_count'
  ) THEN
    ALTER TABLE profiles ADD COLUMN interaction_count integer DEFAULT 0;
  END IF;
END $$;

-- Function to update interaction count
CREATE OR REPLACE FUNCTION update_interaction_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE profiles
  SET interaction_count = (
    SELECT COUNT(*) FROM song_reviews WHERE user_id = NEW.user_id
  )
  WHERE user_id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update interaction count
DROP TRIGGER IF EXISTS update_interaction_count_trigger ON song_reviews;
CREATE TRIGGER update_interaction_count_trigger
AFTER INSERT OR UPDATE OR DELETE ON song_reviews
FOR EACH ROW EXECUTE FUNCTION update_interaction_count();

-- Function to update song popularity (rolling 30 days)
CREATE OR REPLACE FUNCTION update_song_popularity()
RETURNS void AS $$
BEGIN
  UPDATE songs s
  SET popularity_30d = (
    SELECT COALESCE(AVG(sr.rating), 0)
    FROM song_reviews sr
    WHERE sr.song_id = s.id::text
    AND sr.created_at > now() - interval '30 days'
  );
END;
$$ LANGUAGE plpgsql;
