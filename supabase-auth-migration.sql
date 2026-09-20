CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    role TEXT DEFAULT 'student' CHECK (role IN ('student', 'mod', 'owner')),
    avatar_color TEXT DEFAULT '#0d9488',
    bio TEXT,
    avatar_url TEXT,
    banner_url TEXT,
    banner_pattern TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'student' CHECK (role IN ('student', 'mod', 'owner'));
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Profiles Policies
DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "profiles_update_role" ON public.profiles;
CREATE POLICY "profiles_update_role" ON public.profiles FOR UPDATE USING (true);

-- 3. Confirm all users (bypasses email confirmation requirement)
UPDATE auth.users SET email_confirmed_at = now() WHERE email_confirmed_at IS NULL;

-- 4. Posts and Comments Policies
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "posts_select_all" ON public.posts;
CREATE POLICY "posts_select_all" ON public.posts FOR SELECT USING (true);

DROP POLICY IF EXISTS "posts_insert_auth" ON public.posts;
CREATE POLICY "posts_insert_auth" ON public.posts FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL AND author = (SELECT username FROM public.profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "posts_update_auth" ON public.posts;
CREATE POLICY "posts_update_auth" ON public.posts FOR UPDATE USING (
  author = (SELECT username FROM public.profiles WHERE id = auth.uid()) OR
  (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'mod')
);

DROP POLICY IF EXISTS "posts_delete_auth" ON public.posts;
CREATE POLICY "posts_delete_auth" ON public.posts FOR DELETE USING (
  author = (SELECT username FROM public.profiles WHERE id = auth.uid()) OR
  (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'mod')
);

DROP POLICY IF EXISTS "comments_select_all" ON public.comments;
CREATE POLICY "comments_select_all" ON public.comments FOR SELECT USING (true);

DROP POLICY IF EXISTS "comments_insert_auth" ON public.comments;
CREATE POLICY "comments_insert_auth" ON public.comments FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL AND author = (SELECT username FROM public.profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "comments_update_auth" ON public.comments;
CREATE POLICY "comments_update_auth" ON public.comments FOR UPDATE USING (
  author = (SELECT username FROM public.profiles WHERE id = auth.uid()) OR
  (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'mod')
);

DROP POLICY IF EXISTS "comments_delete_auth" ON public.comments;
CREATE POLICY "comments_delete_auth" ON public.comments FOR DELETE USING (
  author = (SELECT username FROM public.profiles WHERE id = auth.uid()) OR
  (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'mod')
);

-- 5. Auto sync profiles on future signups
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
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

-- 6. Setup Owner Account (username: hh, password: Huss1234)
DELETE FROM auth.identities WHERE provider_id = 'a0000000-0000-0000-0000-000000000001' OR identity_data->>'email' = 'hh@iq-academy.local';
DELETE FROM auth.users WHERE email = 'hh@iq-academy.local' OR id = 'a0000000-0000-0000-0000-000000000001';

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'a0000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'hh@iq-academy.local',
  crypt('Huss1234', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"username":"hh","role":"owner"}'::jsonb,
  now(),
  now()
);

INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
) VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  '{"sub":"a0000000-0000-0000-0000-000000000001","email":"hh@iq-academy.local"}'::jsonb,
  'email',
  'a0000000-0000-0000-0000-000000000001',
  now(),
  now(),
  now()
);

INSERT INTO public.profiles (id, username, role)
VALUES ('a0000000-0000-0000-0000-000000000001', 'hh', 'owner')
ON CONFLICT (username) DO UPDATE 
SET id = 'a0000000-0000-0000-0000-000000000001', role = 'owner';
