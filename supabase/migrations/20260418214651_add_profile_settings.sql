-- Add profile settings columns to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS is_kids boolean default false not null,
ADD COLUMN IF NOT EXISTS ui_language text default 'en' not null,
ADD COLUMN IF NOT EXISTS tmdb_language text default 'en-US' not null,
ADD COLUMN IF NOT EXISTS subtitle_language text default 'ar' not null,
ADD COLUMN IF NOT EXISTS video_quality text default '1080p' not null,
ADD COLUMN IF NOT EXISTS theme_accent text default 'oklch(0.76 0.15 305)' not null;
