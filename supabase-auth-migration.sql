-- ==============================================================================
-- CLEANUP & OWNER AUTO-PROMOTION
-- ==============================================================================

-- 1. Remove corrupted manual entries for hh
DELETE FROM auth.identities WHERE identity_data->>'email' = 'hh@iq-academy.local';
DELETE FROM auth.users WHERE email = 'hh@iq-academy.local';
DELETE FROM public.profiles WHERE username = 'hh';

-- 2. Ensure handle_new_user automatically promotes 'hh' to 'owner'
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

-- 3. Confirm all users automatically
UPDATE auth.users SET email_confirmed_at = now() WHERE email_confirmed_at IS NULL;
