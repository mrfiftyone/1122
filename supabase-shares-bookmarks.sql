-- ═══════════════════════════════════════════════════════════════════════════
-- IQ ACADEMY: SHARES & BOOKMARKS COUNTERS MIGRATION (IDEMPOTENT)
-- Run this script in your Supabase Dashboard -> SQL Editor -> Run
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Add shares_count and bookmarks_count columns to posts
ALTER TABLE IF EXISTS public.posts ADD COLUMN IF NOT EXISTS shares_count integer DEFAULT 0;
ALTER TABLE IF EXISTS public.posts ADD COLUMN IF NOT EXISTS bookmarks_count integer DEFAULT 0;

-- 2. Add bookmarks_count column to teachers
ALTER TABLE IF EXISTS public.teachers ADD COLUMN IF NOT EXISTS bookmarks_count integer DEFAULT 0;

-- 3. Set existing NULL values to 0
UPDATE public.posts SET shares_count = 0 WHERE shares_count IS NULL;
UPDATE public.posts SET bookmarks_count = 0 WHERE bookmarks_count IS NULL;
UPDATE public.teachers SET bookmarks_count = 0 WHERE bookmarks_count IS NULL;

-- 4. Function: increment_post_shares
-- Runs with SECURITY DEFINER so any visitor (guest or logged in) can increment share counter
CREATE OR REPLACE FUNCTION increment_post_shares(target_post_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_count integer;
BEGIN
  UPDATE public.posts
  SET shares_count = COALESCE(shares_count, 0) + 1
  WHERE id::text = target_post_id
  RETURNING shares_count INTO new_count;

  RETURN new_count;
END;
$$;

-- 5. Function: increment_post_bookmarks
CREATE OR REPLACE FUNCTION increment_post_bookmarks(target_post_id text, delta integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_count integer;
BEGIN
  UPDATE public.posts
  SET bookmarks_count = GREATEST(0, COALESCE(bookmarks_count, 0) + delta)
  WHERE id::text = target_post_id
  RETURNING bookmarks_count INTO new_count;

  RETURN new_count;
END;
$$;

-- 6. Function: increment_teacher_bookmarks
CREATE OR REPLACE FUNCTION increment_teacher_bookmarks(target_teacher_id text, delta integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_count integer;
BEGIN
  UPDATE public.teachers
  SET bookmarks_count = GREATEST(0, COALESCE(bookmarks_count, 0) + delta)
  WHERE id::text = target_teacher_id
  RETURNING bookmarks_count INTO new_count;

  RETURN new_count;
END;
$$;

-- 7. Grant execution privileges to anon and authenticated roles
GRANT EXECUTE ON FUNCTION increment_post_shares(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_post_bookmarks(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_teacher_bookmarks(text, integer) TO anon, authenticated;

-- 8. Bookmarks table for syncing user bookmarks across devices
CREATE TABLE IF NOT EXISTS public.bookmarks (
  id text PRIMARY KEY,
  username text NOT NULL,
  target_id text NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  subtitle text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (username, target_id)
);

ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bookmarks_select_policy" ON public.bookmarks FOR SELECT USING (true);
CREATE POLICY "bookmarks_insert_policy" ON public.bookmarks FOR INSERT WITH CHECK (true);
CREATE POLICY "bookmarks_update_policy" ON public.bookmarks FOR UPDATE USING (true);
CREATE POLICY "bookmarks_delete_policy" ON public.bookmarks FOR DELETE USING (true);
