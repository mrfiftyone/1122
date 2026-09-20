-- Phase 1: Create Profiles Table if it doesn't exist (it should)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    role TEXT DEFAULT 'student' CHECK (role IN ('student', 'mod', 'owner')),
    avatar_color TEXT DEFAULT '#0d9488',
    bio TEXT,
    avatar_url TEXT,
    banner_url TEXT,
    banner_pattern TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Note: In the existing database, profiles might have a different primary key or no UUID.
-- If 'profiles' already exists without an 'id' or 'role' column, we need to alter it:
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS id UUID REFERENCES auth.users(id);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'student' CHECK (role IN ('student', 'mod', 'owner'));

-- Phase 2: Create a function and trigger to auto-create profiles on signup
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, role)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'username',
    COALESCE(NEW.raw_user_meta_data->>'role', 'student')
  )
  ON CONFLICT (username) DO UPDATE 
  SET id = EXCLUDED.id; 
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Phase 3: Secure the roles modification
-- Only owners and mods can update roles (though owners can do more).
CREATE POLICY "profiles_update_role" ON profiles
  FOR UPDATE USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner', 'mod')
  );

-- Phase 4: Make sure posts/comments policies use the NEW profiles table logic
-- Drop old policies to avoid conflict
DROP POLICY IF EXISTS "posts_insert_own" ON posts;
DROP POLICY IF EXISTS "posts_update_own" ON posts;
DROP POLICY IF EXISTS "posts_delete_own" ON posts;
DROP POLICY IF EXISTS "posts_insert_auth" ON posts;
DROP POLICY IF EXISTS "posts_update_auth" ON posts;
DROP POLICY IF EXISTS "posts_delete_auth" ON posts;
DROP POLICY IF EXISTS "posts_select_all" ON posts;

CREATE POLICY "posts_select_all" ON posts
  FOR SELECT USING (true);

CREATE POLICY "posts_insert_auth" ON posts
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND 
    author = (SELECT username FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "posts_update_auth" ON posts
  FOR UPDATE USING (
    author = (SELECT username FROM profiles WHERE id = auth.uid()) OR
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner', 'mod')
  );

CREATE POLICY "posts_delete_auth" ON posts
  FOR DELETE USING (
    author = (SELECT username FROM profiles WHERE id = auth.uid()) OR
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner', 'mod')
  );

-- Same for comments
DROP POLICY IF EXISTS "comments_insert_own" ON comments;
DROP POLICY IF EXISTS "comments_update_own" ON comments;
DROP POLICY IF EXISTS "comments_delete_own" ON comments;
DROP POLICY IF EXISTS "comments_insert_auth" ON comments;
DROP POLICY IF EXISTS "comments_update_auth" ON comments;
DROP POLICY IF EXISTS "comments_delete_auth" ON comments;
DROP POLICY IF EXISTS "comments_select_all" ON comments;

CREATE POLICY "comments_select_all" ON comments
  FOR SELECT USING (true);

CREATE POLICY "comments_insert_auth" ON comments
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND 
    author = (SELECT username FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "comments_update_auth" ON comments
  FOR UPDATE USING (
    author = (SELECT username FROM profiles WHERE id = auth.uid()) OR
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner', 'mod')
  );

CREATE POLICY "comments_delete_auth" ON comments
  FOR DELETE USING (
    author = (SELECT username FROM profiles WHERE id = auth.uid()) OR
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner', 'mod')
  );
