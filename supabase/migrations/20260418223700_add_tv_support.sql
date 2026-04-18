-- Add TV show support to watch_history and favorites
-- media_type: 'movie' or 'tv'
-- season/episode: for TV show episode tracking

ALTER TABLE watch_history
ADD COLUMN IF NOT EXISTS media_type text default 'movie' not null,
ADD COLUMN IF NOT EXISTS season integer,
ADD COLUMN IF NOT EXISTS episode integer;

ALTER TABLE favorites
ADD COLUMN IF NOT EXISTS media_type text default 'movie' not null;

-- Drop the old unique constraint and create a new one that includes media_type
-- This allows the same TMDB ID to exist for both a movie and a TV show
ALTER TABLE watch_history DROP CONSTRAINT IF EXISTS watch_history_profile_id_imdb_id_key;
ALTER TABLE watch_history ADD CONSTRAINT watch_history_profile_media_unique UNIQUE (profile_id, imdb_id, media_type, season, episode);

ALTER TABLE favorites DROP CONSTRAINT IF EXISTS favorites_profile_id_imdb_id_key;
ALTER TABLE favorites ADD CONSTRAINT favorites_profile_media_unique UNIQUE (profile_id, imdb_id, media_type);

-- For TV episode tracking, create a summary index
CREATE INDEX IF NOT EXISTS idx_watch_history_tv ON watch_history (profile_id, media_type, imdb_id)
WHERE media_type = 'tv';
