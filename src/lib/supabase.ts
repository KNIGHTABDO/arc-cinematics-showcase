import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://placeholder-url.supabase.co";
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "placeholder-key";

// Create a single supabase client for interacting with your database
export const supabase = createClient(supabaseUrl, supabaseKey);

// Types
export type Profile = {
  id: string;
  user_id: string;
  name: string;
  avatar_url: string | null;
  is_kids: boolean;
  ui_language: string;
  tmdb_language: string;
  subtitle_language: string;
  video_quality: string;
  theme_accent: string;
  created_at: string;
};

export type WatchHistory = {
  id: string;
  profile_id: string;
  imdb_id: string;
  progress: number;
  duration: number;
  updated_at: string;
};

export type Favorite = {
  id: string;
  profile_id: string;
  imdb_id: string;
  created_at: string;
};
