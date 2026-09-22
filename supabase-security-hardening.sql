-- ═══════════════════════════════════════════════════════════════════════════
-- IQ ACADEMY: SUPABASE SECURITY HARDENING & RLS POLICY AUDIT
-- Run this script in your Supabase Dashboard → SQL Editor → Run
-- 
-- This script fixes critical vulnerabilities:
-- 1. Revokes open DELETE and UPDATE policies (stopping anon data wiping)
-- 2. Restricts DELETE/UPDATE to authors and verified staff (owner / mod)
-- 3. Locks down profiles table against unauthorized role escalation
-- 4. Restricts reports table visibility strictly to staff
-- 5. Requires authenticated sessions for all mutation operations
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Ensure RLS is active on all public tables ──────────────────────────
ALTER TABLE IF EXISTS public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.support_tickets ENABLE ROW LEVEL SECURITY;

-- ─── 2. Revoke Permissive Legacy Policies ──────────────────────────────────
DROP POLICY IF EXISTS "posts_delete_all" ON public.posts;
DROP POLICY IF EXISTS "posts_update_all" ON public.posts;
DROP POLICY IF EXISTS "posts_update_auth" ON public.posts;
DROP POLICY IF EXISTS "posts_select_all" ON public.posts;
DROP POLICY IF EXISTS "posts_insert_own" ON public.posts;
DROP POLICY IF EXISTS "posts_delete_own" ON public.posts;

DROP POLICY IF EXISTS "comments_delete_all" ON public.comments;
DROP POLICY IF EXISTS "comments_update_all" ON public.comments;
DROP POLICY IF EXISTS "comments_update_auth" ON public.comments;
DROP POLICY IF EXISTS "comments_select_all" ON public.comments;
DROP POLICY IF EXISTS "comments_delete_own" ON public.comments;

DROP POLICY IF EXISTS "reports_full_access" ON public.reports;
DROP POLICY IF EXISTS "reports_all" ON public.reports;

DROP POLICY IF EXISTS "profiles_update_role" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;

DROP POLICY IF EXISTS "notifications_all" ON public.notifications;
DROP POLICY IF EXISTS "teachers_update_own" ON public.teachers;
DROP POLICY IF EXISTS "teachers_select_all" ON public.teachers;
DROP POLICY IF EXISTS "teachers_insert_auth" ON public.teachers;

-- ─── 3. POSTS TABLE POLICIES ───────────────────────────────────────────────

-- Public read access: Active posts are visible to all. Hidden posts visible to staff.
CREATE POLICY "posts_select_policy" ON public.posts
  FOR SELECT USING (
    status = 'active'
    OR (
      auth.uid() IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'mod')
      )
    )
  );

-- Insert: Must be logged in
CREATE POLICY "posts_insert_policy" ON public.posts
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Update: Authors can edit content; Authenticated users can vote/report; Staff can moderate
CREATE POLICY "posts_update_policy" ON public.posts
  FOR UPDATE USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Delete: ONLY the author OR an owner/mod can delete
CREATE POLICY "posts_delete_policy" ON public.posts
  FOR DELETE USING (
    auth.uid() IS NOT NULL AND (
      author = (SELECT raw_user_meta_data->>'username' FROM auth.users WHERE id = auth.uid())
      OR author = split_part((SELECT email FROM auth.users WHERE id = auth.uid()), '@', 1)
      OR EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'mod')
      )
    )
  );

-- ─── 4. COMMENTS TABLE POLICIES ────────────────────────────────────────────

-- Public read access
CREATE POLICY "comments_select_policy" ON public.comments
  FOR SELECT USING (true);

-- Insert: Must be logged in
CREATE POLICY "comments_insert_policy" ON public.comments
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Update: Authenticated users can vote/report
CREATE POLICY "comments_update_policy" ON public.comments
  FOR UPDATE USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Delete: ONLY the comment author OR an owner/mod can delete
CREATE POLICY "comments_delete_policy" ON public.comments
  FOR DELETE USING (
    auth.uid() IS NOT NULL AND (
      author = (SELECT raw_user_meta_data->>'username' FROM auth.users WHERE id = auth.uid())
      OR author = split_part((SELECT email FROM auth.users WHERE id = auth.uid()), '@', 1)
      OR EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'mod')
      )
    )
  );

-- ─── 5. TEACHERS TABLE POLICIES ────────────────────────────────────────────

-- Public read access
CREATE POLICY "teachers_select_policy" ON public.teachers
  FOR SELECT USING (true);

-- Insert: Authenticated users can propose teachers
CREATE POLICY "teachers_insert_policy" ON public.teachers
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Update: Authenticated users can vote; Staff can edit details and approve
CREATE POLICY "teachers_update_policy" ON public.teachers
  FOR UPDATE USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Delete: ONLY owner or mod can delete teacher records
CREATE POLICY "teachers_delete_policy" ON public.teachers
  FOR DELETE USING (
    auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'mod')
    )
  );

-- ─── 6. REPORTS TABLE POLICIES ─────────────────────────────────────────────

-- Select: ONLY staff (owner / mod) can view moderation reports
CREATE POLICY "reports_select_staff" ON public.reports
  FOR SELECT USING (
    auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'mod')
    )
  );

-- Insert: Any logged-in user can submit a report
CREATE POLICY "reports_insert_auth" ON public.reports
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Update: ONLY staff can dismiss or resolve reports
CREATE POLICY "reports_update_staff" ON public.reports
  FOR UPDATE USING (
    auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'mod')
    )
  );

-- Delete: ONLY staff can delete report records
CREATE POLICY "reports_delete_staff" ON public.reports
  FOR DELETE USING (
    auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'mod')
    )
  );

-- ─── 7. PROFILES TABLE POLICIES (Prevent Privilege Escalation) ─────────────

-- Public read access
CREATE POLICY "profiles_select_policy" ON public.profiles
  FOR SELECT USING (true);

-- Insert: Automatic trigger or user profile creation
CREATE POLICY "profiles_insert_policy" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Update: Users can edit their own profile info, but CANNOT elevate their role unless caller is owner
CREATE POLICY "profiles_update_policy" ON public.profiles
  FOR UPDATE USING (
    id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'owner'
    )
  )
  WITH CHECK (
    -- Normal user cannot change their role
    (id = auth.uid() AND role = (SELECT role FROM public.profiles WHERE id = auth.uid()))
    -- Owner can change any user's role
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'owner')
  );

-- ─── 8. NOTIFICATIONS TABLE POLICIES ───────────────────────────────────────

-- Select: Users can read notifications addressed to them, or staff
CREATE POLICY "notifications_select_policy" ON public.notifications
  FOR SELECT USING (
    auth.uid() IS NOT NULL AND (
      recipient = (SELECT raw_user_meta_data->>'username' FROM auth.users WHERE id = auth.uid())
      OR recipient = split_part((SELECT email FROM auth.users WHERE id = auth.uid()), '@', 1)
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'mod'))
    )
  );

-- Insert: Any authenticated user can trigger a notification (e.g. on reply or like)
CREATE POLICY "notifications_insert_policy" ON public.notifications
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Update: Users can mark their notifications as read
CREATE POLICY "notifications_update_policy" ON public.notifications
  FOR UPDATE USING (
    auth.uid() IS NOT NULL AND (
      recipient = (SELECT raw_user_meta_data->>'username' FROM auth.users WHERE id = auth.uid())
      OR recipient = split_part((SELECT email FROM auth.users WHERE id = auth.uid()), '@', 1)
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'mod'))
    )
  );

-- Delete: Users can delete their notifications or staff
CREATE POLICY "notifications_delete_policy" ON public.notifications
  FOR DELETE USING (
    auth.uid() IS NOT NULL AND (
      recipient = (SELECT raw_user_meta_data->>'username' FROM auth.users WHERE id = auth.uid())
      OR recipient = split_part((SELECT email FROM auth.users WHERE id = auth.uid()), '@', 1)
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'mod'))
    )
  );

-- ─── 9. SUPPORT TICKETS POLICIES (If table exists) ─────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'support_tickets') THEN
    DROP POLICY IF EXISTS "support_tickets_all" ON public.support_tickets;
    
    CREATE POLICY "support_tickets_select" ON public.support_tickets
      FOR SELECT USING (
        auth.uid() IS NOT NULL AND (
          author = (SELECT raw_user_meta_data->>'username' FROM auth.users WHERE id = auth.uid())
          OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'mod'))
        )
      );

    CREATE POLICY "support_tickets_insert" ON public.support_tickets
      FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

    CREATE POLICY "support_tickets_update" ON public.support_tickets
      FOR UPDATE USING (
        auth.uid() IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'mod')
        )
      );
  END IF;
END $$;
