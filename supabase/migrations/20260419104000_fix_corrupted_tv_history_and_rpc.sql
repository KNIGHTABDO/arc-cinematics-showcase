-- Add RPC to allow users to delete their own accounts
CREATE OR REPLACE FUNCTION delete_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Clean up user data in public schema first
  DELETE FROM public.watch_history WHERE profile_id IN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  );
  DELETE FROM public.favorites WHERE profile_id IN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  );
  DELETE FROM public.profiles WHERE user_id = auth.uid();
  
  -- Then delete the auth user
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

-- Fix corrupted TV watch_history entries
-- Only update rows where the regex actually extracts a valid value
UPDATE watch_history 
SET 
  media_type = 'tv',
  imdb_id = substring(imdb_id from 'tv-([0-9]+)'),
  season = COALESCE(cast(nullif(substring(imdb_id from 's([0-9]+)e'), '') as int), 1),
  episode = COALESCE(cast(nullif(substring(imdb_id from 'e([0-9]+)'), '') as int), 1)
WHERE 
  imdb_id LIKE 'tv-%' 
  AND substring(imdb_id from 'tv-([0-9]+)') IS NOT NULL;

-- Fix corrupted TV favorites entries  
-- Only update rows where the regex actually extracts a valid value
UPDATE favorites
SET 
  media_type = 'tv',
  imdb_id = substring(imdb_id from 'tv-([0-9]+)')
WHERE 
  imdb_id LIKE 'tv-%'
  AND substring(imdb_id from 'tv-([0-9]+)') IS NOT NULL;

-- Delete any remaining rows that are truly corrupted (tv- prefix but no extractable ID)
DELETE FROM favorites WHERE imdb_id LIKE 'tv-%';
DELETE FROM watch_history WHERE imdb_id LIKE 'tv-%';
