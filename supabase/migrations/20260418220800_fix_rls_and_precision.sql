-- Fix RLS policies: add WITH CHECK for INSERT/UPDATE/DELETE
-- Fix progress type: use float8 for millisecond precision

---------------------------------------------------------------
-- WATCH HISTORY: Fix progress to float8 + fix RLS
---------------------------------------------------------------
ALTER TABLE watch_history ALTER COLUMN progress TYPE float8;
ALTER TABLE watch_history ALTER COLUMN duration TYPE float8;

-- Drop old restrictive policy and create proper ones
DROP POLICY IF EXISTS "Users can manage own watch history" ON watch_history;

CREATE POLICY "Users can read own watch history"
ON watch_history FOR SELECT
USING (
  profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Users can insert own watch history"
ON watch_history FOR INSERT
WITH CHECK (
  profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Users can update own watch history"
ON watch_history FOR UPDATE
USING (
  profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
)
WITH CHECK (
  profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Users can delete own watch history"
ON watch_history FOR DELETE
USING (
  profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);

---------------------------------------------------------------
-- FAVORITES: Fix RLS
---------------------------------------------------------------
DROP POLICY IF EXISTS "Users can manage own favorites" ON favorites;

CREATE POLICY "Users can read own favorites"
ON favorites FOR SELECT
USING (
  profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Users can insert own favorites"
ON favorites FOR INSERT
WITH CHECK (
  profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Users can delete own favorites"
ON favorites FOR DELETE
USING (
  profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);

---------------------------------------------------------------
-- PROFILES: Fix RLS for inserts too
---------------------------------------------------------------
DROP POLICY IF EXISTS "Profiles are viewable by owning user." ON profiles;
DROP POLICY IF EXISTS "Users can read own profiles" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update own profiles" ON profiles;
DROP POLICY IF EXISTS "Users can delete own profiles" ON profiles;

CREATE POLICY "Users can read own profiles"
ON profiles FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own profiles"
ON profiles FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own profiles"
ON profiles FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own profiles"
ON profiles FOR DELETE
USING (user_id = auth.uid());
