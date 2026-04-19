-- Add missing UNIQUE constraint for upsert operations
ALTER TABLE watch_history
ADD CONSTRAINT watch_history_profile_id_imdb_id_key UNIQUE (profile_id, imdb_id);
