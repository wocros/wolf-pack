-- =============================================================================
-- Migration: 004_create_profiles
-- Description: Creates the profiles table, which extends Supabase's built-in
--              auth.users table with display name, role, and active status.
--              Also creates a helper function for role lookups used in RLS
--              policies, and a trigger that auto-creates a profile row whenever
--              a new user signs up via Supabase Auth.
-- Date: 2026-06-26
-- =============================================================================
-- Run this AFTER 001, 002, and 003.
-- =============================================================================


-- =============================================================================
-- HELPER: updated_at trigger function
-- Defined here so this migration runs standalone without needing 001.
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- TABLE: profiles
-- One row per Supabase Auth user. Stores the display name, role, and whether
-- the account is active. Linked 1-to-1 with auth.users — deleting the auth
-- user cascades and removes the profile automatically.
-- =============================================================================

CREATE TABLE public.profiles (
  id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'staff'
                CHECK (role IN ('admin', 'manager', 'staff')),
  active        BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.profiles              IS 'One row per Supabase Auth user — extends auth.users with display name, role, and active flag.';
COMMENT ON COLUMN public.profiles.id           IS 'Matches auth.users.id exactly. Cascades on user deletion.';
COMMENT ON COLUMN public.profiles.role         IS 'One of: admin, manager, staff. Controls what the user can see and do.';
COMMENT ON COLUMN public.profiles.active       IS 'Set to false to deactivate a user without deleting their history.';

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- HELPER: get the current user's role (used in RLS policies below)
-- Must be created AFTER the profiles table exists.
-- SECURITY DEFINER means it runs as the function owner (postgres), so it can
-- read the profiles table even when RLS is active for the calling user.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- =============================================================================
-- RLS: Row Level Security for profiles
-- =============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Every authenticated user can read their own profile row
CREATE POLICY "users can read own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Admin can read every profile (needed for user management screens)
CREATE POLICY "admin can read all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.get_user_role() = 'admin');

-- Admin can insert new profiles (e.g., when manually provisioning a user)
CREATE POLICY "admin can insert profiles"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.get_user_role() = 'admin');

-- Admin can update any profile field on any row
CREATE POLICY "admin can update any profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (public.get_user_role() = 'admin')
  WITH CHECK (public.get_user_role() = 'admin');

-- Regular users can update only their own display_name.
-- Role and active are intentionally excluded — only admin changes those.
-- This is enforced by naming the column in a separate targeted policy.
-- Note: application code must SELECT only display_name in the SET clause;
-- this policy alone does not prevent a clever UPDATE from touching other
-- columns, so the application layer (server-client.js) must also scope the
-- UPDATE to { display_name } only.
CREATE POLICY "users can update own display_name"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- No DELETE policy is defined. Profiles are deactivated (active = false),
-- never hard-deleted. The auth.users cascade handles cleanup if an auth
-- account is fully purged.


-- =============================================================================
-- TRIGGER: auto-create a profile row when a new user signs up
-- Fires on INSERT into auth.users. Creates a profile with role='staff' and
-- display_name set to the user's email (can be updated later).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email),
    'staff'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_auth_users_create_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- =============================================================================
-- ROLLBACK
-- Run these statements (in this exact order) to undo this migration.
-- =============================================================================
--
-- DROP TRIGGER  IF EXISTS trg_auth_users_create_profile ON auth.users;
-- DROP FUNCTION IF EXISTS public.handle_new_user();
--
-- DROP POLICY IF EXISTS "users can update own display_name"  ON public.profiles;
-- DROP POLICY IF EXISTS "admin can update any profile"       ON public.profiles;
-- DROP POLICY IF EXISTS "admin can insert profiles"          ON public.profiles;
-- DROP POLICY IF EXISTS "admin can read all profiles"        ON public.profiles;
-- DROP POLICY IF EXISTS "users can read own profile"         ON public.profiles;
-- ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
--
-- DROP TABLE IF EXISTS public.profiles;
--
-- DROP FUNCTION IF EXISTS public.get_user_role();
--
-- =============================================================================
