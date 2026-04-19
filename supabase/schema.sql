-- ARC Cinematics Supabase Schema
-- Execute this entire file in your Supabase SQL Editor.

-- Enable Row Level Security (RLS) Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

---------------------------------------------------------------
-- 1. PROFILES TABLE (Multi-profile Netflix style)
---------------------------------------------------------------
create table profiles (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  avatar_url text,
  ui_language text default 'en' not null,
  tmdb_language text default 'en-US' not null,
  subtitle_language text default 'ar' not null,
  video_quality text default '1080p' not null,
  theme_accent text default 'oklch(0.76 0.15 305)' not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Turn on Row Level Security
alter table profiles enable row level security;

-- Policy: Users can only see profiles attached to their Auth ID
create policy "Users can view own profiles" 
on profiles for select 
using (auth.uid() = user_id);

-- Policy: Users can insert their own profiles
create policy "Users can insert own profiles" 
on profiles for insert 
with check (auth.uid() = user_id);

-- Policy: Users can update their own profiles
create policy "Users can update own profiles" 
on profiles for update 
using (auth.uid() = user_id);

-- Policy: Users can delete their own profiles
create policy "Users can delete own profiles" 
on profiles for delete 
using (auth.uid() = user_id);

---------------------------------------------------------------
-- 2. WATCH HISTORY (Continue Watching logic)
---------------------------------------------------------------
create table watch_history (
  id uuid default uuid_generate_v4() primary key,
  profile_id uuid references profiles(id) on delete cascade not null,
  imdb_id text not null,
  progress integer default 0 not null, -- Seconds watched
  duration integer default 1 not null, -- Total movie length
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(profile_id, imdb_id) -- Prevent duplicate entries for same movie
);

alter table watch_history enable row level security;

-- Policy: Users can only edit history if they own the related profile
create policy "Users can manage own watch history"
on watch_history
using (
  profile_id in (
    select id from profiles where user_id = auth.uid()
  )
);

---------------------------------------------------------------
-- 3. FAVORITES (My List)
---------------------------------------------------------------
create table favorites (
  id uuid default uuid_generate_v4() primary key,
  profile_id uuid references profiles(id) on delete cascade not null,
  imdb_id text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(profile_id, imdb_id)
);

alter table favorites enable row level security;

create policy "Users can manage own favorites"
on favorites
using (
  profile_id in (
    select id from profiles where user_id = auth.uid()
  )
);

---------------------------------------------------------------
-- 4. UTILITY TRIGGERS
---------------------------------------------------------------
-- Automatically create a default profile when a new user signs up
create or replace function public.handle_new_user() 
returns trigger as $$
begin
  insert into public.profiles (user_id, name)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
