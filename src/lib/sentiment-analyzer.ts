export interface SentimentResult {
  sentiment_score: number;
  toxicity_score: number;
  emotion_tags: string[];
}

const positiveWords = new Set([
  'love', 'amazing', 'beautiful', 'perfect', 'great', 'excellent', 'wonderful',
  'fantastic', 'brilliant', 'awesome', 'incredible', 'outstanding', 'superb',
  'masterpiece', 'genius', 'epic', 'legendary', 'iconic', 'phenomenal',
  'best', 'favorite', 'adore', 'enjoy', 'like', 'happy', 'joyful', 'uplifting',
  'inspiring', 'moving', 'powerful', 'stunning', 'gorgeous', 'divine',
]);

const negativeWords = new Set([
  'hate', 'terrible', 'awful', 'horrible', 'worst', 'bad', 'poor', 'disappointing',
  'boring', 'dull', 'mediocre', 'trash', 'garbage', 'waste', 'sucks', 'lame',
  'annoying', 'irritating', 'overrated', 'unlistenable', 'painful', 'cringe',
]);

const toxicWords = new Set([
  'stupid', 'idiot', 'moron', 'dumb', 'trash', 'garbage', 'sucks', 'kill',
  'die', 'hate', 'disgusting', 'pathetic', 'loser', 'ugly', 'worthless',
]);

const emotionKeywords: Record<string, Set<string>> = {
  joy: new Set(['happy', 'joyful', 'cheerful', 'upbeat', 'fun', 'playful', 'energetic']),
  sadness: new Set(['sad', 'melancholy', 'depressing', 'somber', 'dark', 'emotional', 'tearjerker']),
  anger: new Set(['angry', 'aggressive', 'intense', 'powerful', 'furious', 'rage']),
  nostalgia: new Set(['nostalgic', 'memories', 'reminds', 'throwback', 'classic', 'timeless']),
  calm: new Set(['calm', 'peaceful', 'relaxing', 'soothing', 'chill', 'ambient', 'tranquil']),
  energetic: new Set(['energetic', 'hype', 'pumped', 'exciting', 'vibrant', 'dynamic']),
};

export function analyzeSentiment(text: string | null): SentimentResult {
  if (!text || text.trim().length === 0) {
    return {
      sentiment_score: 0,
      toxicity_score: 0,
      emotion_tags: [],
    };
  }

  const normalizedText = text.toLowerCase();
  const words = normalizedText.split(/\s+/);

  let positiveCount = 0;
  let negativeCount = 0;
  let toxicCount = 0;
  const detectedEmotions = new Set<string>();

  words.forEach(word => {
    const cleanWord = word.replace(/[^\w]/g, '');

    if (positiveWords.has(cleanWord)) positiveCount++;
    if (negativeWords.has(cleanWord)) negativeCount++;
    if (toxicWords.has(cleanWord)) toxicCount++;

    Object.entries(emotionKeywords).forEach(([emotion, keywords]) => {
      if (keywords.has(cleanWord)) {
        detectedEmotions.add(emotion);
      }
    });
  });

  const totalSentimentWords = positiveCount + negativeCount;
  let sentimentScore = 0;

  if (totalSentimentWords > 0) {
    sentimentScore = (positiveCount - negativeCount) / totalSentimentWords;
  }

  sentimentScore = Math.max(-1, Math.min(1, sentimentScore));

  const toxicityScore = Math.min(1, toxicCount / Math.max(1, words.length) * 5);

  const emptyReviewPenalty = text.trim().length < 10 ? 0.3 : 0;
  const finalToxicityScore = Math.min(1, toxicityScore + emptyReviewPenalty);

  return {
    sentiment_score: sentimentScore,
    toxicity_score: finalToxicityScore,
    emotion_tags: Array.from(detectedEmotions),
  };
}

export async function analyzeAndStoreSentiment(reviewId: string, reviewText: string | null) {
  const sentiment = analyzeSentiment(reviewText);

  const { supabase } = await import('@/integrations/supabase/client');

  await supabase
    .from('review_sentiment')
    .upsert({
      review_id: reviewId,
      sentiment_score: sentiment.sentiment_score,
      toxicity_score: sentiment.toxicity_score,
      emotion_tags: sentiment.emotion_tags,
      processed_at: new Date().toISOString(),
    });

  return sentiment;
}
