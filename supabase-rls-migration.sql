-- ═══════════════════════════════════════════════════════════════════
-- Phase 4: Supabase Row Level Security (RLS) Migration
-- Run this in your Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- ─── Enable RLS on all tables ─────────────────────────────────────
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- ─── POSTS ────────────────────────────────────────────────────────

-- Anyone can read active posts
CREATE POLICY "posts_select_all" ON posts
  FOR SELECT USING (true);

-- Authenticated users can insert their own posts
CREATE POLICY "posts_insert_own" ON posts
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Users can only update their own posts
CREATE POLICY "posts_update_own" ON posts
  FOR UPDATE USING (
    author = (SELECT raw_user_meta_data->>'username' FROM auth.users WHERE id = auth.uid())
  );

-- Users can only delete their own posts (admin deletion handled via service role)
CREATE POLICY "posts_delete_own" ON posts
  FOR DELETE USING (
    author = (SELECT raw_user_meta_data->>'username' FROM auth.users WHERE id = auth.uid())
  );

-- ─── COMMENTS ─────────────────────────────────────────────────────

-- Anyone can read comments
CREATE POLICY "comments_select_all" ON comments
  FOR SELECT USING (true);

-- Authenticated users can insert comments
CREATE POLICY "comments_insert_own" ON comments
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Users can only update their own comments
CREATE POLICY "comments_update_own" ON comments
  FOR UPDATE USING (
    author = (SELECT raw_user_meta_data->>'username' FROM auth.users WHERE id = auth.uid())
  );

-- Users can only delete their own comments
CREATE POLICY "comments_delete_own" ON comments
  FOR DELETE USING (
    author = (SELECT raw_user_meta_data->>'username' FROM auth.users WHERE id = auth.uid())
  );

-- ─── TEACHERS ─────────────────────────────────────────────────────

-- Anyone can read teachers
CREATE POLICY "teachers_select_all" ON teachers
  FOR SELECT USING (true);

-- Authenticated users can submit teacher entries
CREATE POLICY "teachers_insert_auth" ON teachers
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Only the creator or admin can update a teacher
CREATE POLICY "teachers_update_own" ON teachers
  FOR UPDATE USING (
    created_by = (SELECT raw_user_meta_data->>'username' FROM auth.users WHERE id = auth.uid())
  );

-- ─── VOTES ────────────────────────────────────────────────────────

-- Users can read their own votes
CREATE POLICY "votes_select_own" ON votes
  FOR SELECT USING (
    username = (SELECT raw_user_meta_data->>'username' FROM auth.users WHERE id = auth.uid())
  );

-- Authenticated users can insert/update their own votes
CREATE POLICY "votes_upsert_own" ON votes
  FOR INSERT WITH CHECK (
    username = (SELECT raw_user_meta_data->>'username' FROM auth.users WHERE id = auth.uid())
  );

CREATE POLICY "votes_update_own" ON votes
  FOR UPDATE USING (
    username = (SELECT raw_user_meta_data->>'username' FROM auth.users WHERE id = auth.uid())
  );

-- ─── PROFILES ─────────────────────────────────────────────────────

-- Anyone can read profiles (public data)
CREATE POLICY "profiles_select_all" ON profiles
  FOR SELECT USING (true);

-- Users can only update their own profile
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (
    username = (SELECT raw_user_meta_data->>'username' FROM auth.users WHERE id = auth.uid())
  );

-- Authenticated users can insert their own profile
CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (
    username = (SELECT raw_user_meta_data->>'username' FROM auth.users WHERE id = auth.uid())
  );
