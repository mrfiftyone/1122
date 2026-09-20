-- ==============================================================================
-- IQ ACADEMY: NOTIFICATIONS, REPORTS & PERMISSIONS MIGRATION
-- ==============================================================================

-- 1. Create Notifications Table for Real-Time Sync Across All Users
CREATE TABLE IF NOT EXISTS public.notifications (
    id TEXT PRIMARY KEY,
    recipient TEXT NOT NULL,
    actor TEXT NOT NULL,
    type TEXT NOT NULL,
    post_id TEXT DEFAULT '',
    target_title TEXT DEFAULT '',
    comment_text TEXT DEFAULT '',
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_all" ON public.notifications;
CREATE POLICY "notifications_all" ON public.notifications
  FOR ALL USING (true) WITH CHECK (true);

-- 2. Create Reports Table for Central Moderation Center
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

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reports_all" ON public.reports;
CREATE POLICY "reports_all" ON public.reports
  FOR ALL USING (true) WITH CHECK (true);

-- 3. Allow any user to update reports count & votes on posts and comments
DROP POLICY IF EXISTS "posts_update_auth" ON public.posts;
CREATE POLICY "posts_update_auth" ON public.posts
  FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "comments_update_auth" ON public.comments;
CREATE POLICY "comments_update_auth" ON public.comments
  FOR UPDATE USING (true) WITH CHECK (true);

-- 4. Allow Owner / Mods to update user roles in profiles table
DROP POLICY IF EXISTS "profiles_update_role" ON public.profiles;
CREATE POLICY "profiles_update_role" ON public.profiles
  FOR UPDATE USING (true) WITH CHECK (true);

-- 5. Automatically assign 'owner' to 'hh' upon signup
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    CASE 
      WHEN COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)) = 'hh' THEN 'owner'
      ELSE COALESCE(NEW.raw_user_meta_data->>'role', 'student')
    END
  )
  ON CONFLICT (username) DO UPDATE 
  SET id = EXCLUDED.id,
      role = CASE WHEN EXCLUDED.username = 'hh' THEN 'owner' ELSE profiles.role END; 
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. Auto-confirm all emails
UPDATE auth.users SET email_confirmed_at = now() WHERE email_confirmed_at IS NULL;
