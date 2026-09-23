-- ═══════════════════════════════════════════════════════════════════════════
-- IQ ACADEMY: SHARES & BOOKMARKS COUNTERS MIGRATION (IDEMPOTENT)
-- Run this script in your Supabase Dashboard → SQL Editor → Run
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
