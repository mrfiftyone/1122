-- ═══════════════════════════════════════════════════════════════════
-- IQ ACADEMY: MODERATION & REPORTS RLS FIX
-- Run this in Supabase Dashboard → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════════

-- 1. Create or ensure reports table exists
CREATE TABLE IF NOT EXISTS public.reports (
    id TEXT PRIMARY KEY,
    target_id TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_title TEXT DEFAULT '',
    reporter TEXT NOT NULL,
    reason TEXT NOT NULL,
    note TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Open full permissions on reports table so mods and users can read, insert, update and delete
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reports_all" ON public.reports;
DROP POLICY IF EXISTS "reports_full_access" ON public.reports;
CREATE POLICY "reports_full_access" ON public.reports
  FOR ALL USING (true) WITH CHECK (true);

-- 3. Allow mods & users to UPDATE posts (e.g. resetting reports to 0, hiding posts)
DROP POLICY IF EXISTS "posts_update_all" ON public.posts;
DROP POLICY IF EXISTS "posts_update_auth" ON public.posts;
CREATE POLICY "posts_update_all" ON public.posts
  FOR UPDATE USING (true) WITH CHECK (true);

-- 4. Allow mods to DELETE reported posts
DROP POLICY IF EXISTS "posts_delete_all" ON public.posts;
CREATE POLICY "posts_delete_all" ON public.posts
  FOR DELETE USING (true);

-- 5. Allow mods & users to UPDATE comments (resetting reports to 0)
DROP POLICY IF EXISTS "comments_update_all" ON public.comments;
DROP POLICY IF EXISTS "comments_update_auth" ON public.comments;
CREATE POLICY "comments_update_all" ON public.comments
  FOR UPDATE USING (true) WITH CHECK (true);

-- 6. Allow mods to DELETE reported comments
DROP POLICY IF EXISTS "comments_delete_all" ON public.comments;
CREATE POLICY "comments_delete_all" ON public.comments
  FOR DELETE USING (true);

-- 7. Add reports to Realtime publication
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reports;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
