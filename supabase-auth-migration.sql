-- ==============================================================================
-- IQ ACADEMY: COMPLETE SUPABASE AUTH, RLS & OWNER SETUP
-- Run this entire script in Supabase Dashboard -> SQL Editor -> New query -> Run
-- ==============================================================================

-- Enable pgcrypto for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------------------------
-- 1. PROFILES TABLE & COLUMNS
-- ------------------------------------------------------------------------------
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
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_color TEXT DEFAULT '#0d9488';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
CREATE POLICY "profiles_select_all" ON public.profiles
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id OR auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "profiles_update_role" ON public.profiles;
CREATE POLICY "profiles_update_role" ON public.profiles
  FOR UPDATE USING (
    auth.uid() = id OR
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'mod')
  );

-- ------------------------------------------------------------------------------
-- 2. AUTO-CONFIRM ALL USERS (NO EMAIL CONFIRMATION REQUIRED)
-- ------------------------------------------------------------------------------
-- Automatically confirm existing users so no unconfirmed email error occurs
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, now())
WHERE email_confirmed_at IS NULL;

-- Automatically confirm any future user on signup
CREATE OR REPLACE FUNCTION public.auto_confirm_new_user()
RETURNS TRIGGER AS $$
BEGIN
  NEW.email_confirmed_at = COALESCE(NEW.email_confirmed_at, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_before_insert ON auth.users;
CREATE TRIGGER on_auth_user_before_insert
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.auto_confirm_new_user();

-- ------------------------------------------------------------------------------
-- 3. AUTO-CREATE PROFILE ON SIGNUP
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- 4. POSTS & COMMENTS POLICIES
-- ------------------------------------------------------------------------------
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "posts_select_all" ON public.posts;
CREATE POLICY "posts_select_all" ON public.posts
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "posts_insert_auth" ON public.posts;
CREATE POLICY "posts_insert_auth" ON public.posts
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND 
    author = (SELECT username FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "posts_update_auth" ON public.posts;
CREATE POLICY "posts_update_auth" ON public.posts
  FOR UPDATE USING (
    author = (SELECT username FROM public.profiles WHERE id = auth.uid()) OR
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'mod')
  );

DROP POLICY IF EXISTS "posts_delete_auth" ON public.posts;
CREATE POLICY "posts_delete_auth" ON public.posts
  FOR DELETE USING (
    author = (SELECT username FROM public.profiles WHERE id = auth.uid()) OR
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'mod')
  );

DROP POLICY IF EXISTS "comments_select_all" ON public.comments;
CREATE POLICY "comments_select_all" ON public.comments
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "comments_insert_auth" ON public.comments;
CREATE POLICY "comments_insert_auth" ON public.comments
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND 
    author = (SELECT username FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "comments_update_auth" ON public.comments;
CREATE POLICY "comments_update_auth" ON public.comments
  FOR UPDATE USING (
    author = (SELECT username FROM public.profiles WHERE id = auth.uid()) OR
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'mod')
  );

DROP POLICY IF EXISTS "comments_delete_auth" ON public.comments;
CREATE POLICY "comments_delete_auth" ON public.comments
  FOR DELETE USING (
    author = (SELECT username FROM public.profiles WHERE id = auth.uid()) OR
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'mod')
  );

-- ------------------------------------------------------------------------------
-- 5. CREATE / UPDATE OWNER ACCOUNT: username "hh" with password "Huss1234"
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_user_id UUID;
  v_encrypted_pw TEXT;
BEGIN
  -- Generate bcrypt hash for Huss1234
  v_encrypted_pw := crypt('Huss1234', gen_salt('bf'));

  -- Check if user already exists
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'hh@iq-academy.local';

  IF v_user_id IS NOT NULL THEN
    -- Update existing user password, metadata, and confirm email
    UPDATE auth.users
    SET encrypted_password = v_encrypted_pw,
        email_confirmed_at = now(),
        raw_user_meta_data = jsonb_build_object('username', 'hh', 'role', 'owner'),
        raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
        updated_at = now()
    WHERE id = v_user_id;
  ELSE
    -- Insert new owner into auth.users
    v_user_id := gen_random_uuid();
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
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      'hh@iq-academy.local',
      v_encrypted_pw,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('username', 'hh', 'role', 'owner'),
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
  END IF;

  -- Ensure identity exists in auth.identities
  DELETE FROM auth.identities WHERE user_id = v_user_id;
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
    v_user_id::text,
    v_user_id,
    format('{"sub":"%s","email":"%s"}', v_user_id::text, 'hh@iq-academy.local')::jsonb,
    'email',
    v_user_id::text,
    now(),
    now(),
    now()
  );

  -- Upsert into public.profiles as owner
  INSERT INTO public.profiles (id, username, role)
  VALUES (v_user_id, 'hh', 'owner')
  ON CONFLICT (username) DO UPDATE 
  SET id = v_user_id, role = 'owner';

END $$;
