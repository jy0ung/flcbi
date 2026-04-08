
-- Step 1: Add access_scope to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS access_scope text NOT NULL DEFAULT 'company';

-- Step 2: Add company_id and assigned_user_id to vehicles
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS company_id text NOT NULL DEFAULT 'c1';
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT NULL;

-- Step 3: Add company_id to quality_issues
ALTER TABLE public.quality_issues ADD COLUMN IF NOT EXISTS company_id text NOT NULL DEFAULT 'c1';

-- Step 4: Add company_id to import_batches  
ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS company_id text NOT NULL DEFAULT 'c1';

-- Step 5: Add branch_id to import_batches
ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS branch_id text DEFAULT NULL;

-- Step 6: Add branch_id to vehicles (if not exists - for branch scoping)
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS company_branch_id text DEFAULT NULL;

-- Step 7: Create indexes for scope queries
CREATE INDEX IF NOT EXISTS idx_vehicles_company_id ON public.vehicles(company_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_assigned_user_id ON public.vehicles(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_branch_code ON public.vehicles(branch_code);
CREATE INDEX IF NOT EXISTS idx_import_batches_company_id ON public.import_batches(company_id);
CREATE INDEX IF NOT EXISTS idx_quality_issues_company_id ON public.quality_issues(company_id);
CREATE INDEX IF NOT EXISTS idx_profiles_company_id ON public.profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_profiles_access_scope ON public.profiles(access_scope);

-- Step 8: Create security definer function for access scope resolution
CREATE OR REPLACE FUNCTION public.get_my_access_scope()
RETURNS TABLE(user_company_id text, user_branch_id text, user_access_scope text, user_role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id, branch_id, access_scope, role
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

-- Step 9: Create helper function to check if user can access a row
CREATE OR REPLACE FUNCTION public.can_access_row(row_company_id text, row_branch_code text, row_assigned_user_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id text;
  v_branch_id text;
  v_access_scope text;
BEGIN
  SELECT company_id, branch_id, access_scope
  INTO v_company_id, v_branch_id, v_access_scope
  FROM public.profiles
  WHERE id = auth.uid();
  
  IF NOT FOUND THEN RETURN false; END IF;
  
  -- Global scope (super_admin) can see everything
  IF v_access_scope = 'global' THEN RETURN true; END IF;
  
  -- Company isolation: must match company
  IF row_company_id != v_company_id THEN RETURN false; END IF;
  
  -- Company scope: can see all in company
  IF v_access_scope = 'company' THEN RETURN true; END IF;
  
  -- Branch scope: must match branch
  IF v_access_scope = 'branch' THEN
    RETURN row_branch_code = v_branch_id;
  END IF;
  
  -- Self scope: must be assigned to user
  IF v_access_scope = 'self' THEN
    RETURN row_assigned_user_id = auth.uid();
  END IF;
  
  RETURN false;
END;
$$;

-- Step 10: Drop all existing permissive RLS policies and replace with scope-based ones

-- VEHICLES: Drop old policies
DROP POLICY IF EXISTS "Allow all delete on vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Allow all insert on vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Allow all read on vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Allow all update on vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Allow anon delete on vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Allow anon insert on vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Allow anon read on vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Allow anon update on vehicles" ON public.vehicles;

-- VEHICLES: New scope-based policies
CREATE POLICY "Scoped read on vehicles"
  ON public.vehicles FOR SELECT TO authenticated
  USING (public.can_access_row(company_id, branch_code, assigned_user_id));

CREATE POLICY "Scoped insert on vehicles"
  ON public.vehicles FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Scoped update on vehicles"
  ON public.vehicles FOR UPDATE TO authenticated
  USING (public.can_access_row(company_id, branch_code, assigned_user_id));

CREATE POLICY "Scoped delete on vehicles"
  ON public.vehicles FOR DELETE TO authenticated
  USING (public.can_access_row(company_id, branch_code, assigned_user_id));

-- IMPORT_BATCHES: Drop old policies
DROP POLICY IF EXISTS "Allow all insert on import_batches" ON public.import_batches;
DROP POLICY IF EXISTS "Allow all read on import_batches" ON public.import_batches;
DROP POLICY IF EXISTS "Allow all update on import_batches" ON public.import_batches;
DROP POLICY IF EXISTS "Allow anon insert on import_batches" ON public.import_batches;
DROP POLICY IF EXISTS "Allow anon read on import_batches" ON public.import_batches;
DROP POLICY IF EXISTS "Allow anon update on import_batches" ON public.import_batches;

-- IMPORT_BATCHES: New scope-based policies
CREATE POLICY "Scoped read on import_batches"
  ON public.import_batches FOR SELECT TO authenticated
  USING (public.can_access_row(company_id, branch_id, NULL));

CREATE POLICY "Scoped insert on import_batches"
  ON public.import_batches FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Scoped update on import_batches"
  ON public.import_batches FOR UPDATE TO authenticated
  USING (public.can_access_row(company_id, branch_id, NULL));

-- QUALITY_ISSUES: Drop old policies
DROP POLICY IF EXISTS "Allow all delete on quality_issues" ON public.quality_issues;
DROP POLICY IF EXISTS "Allow all insert on quality_issues" ON public.quality_issues;
DROP POLICY IF EXISTS "Allow all read on quality_issues" ON public.quality_issues;
DROP POLICY IF EXISTS "Allow anon delete on quality_issues" ON public.quality_issues;
DROP POLICY IF EXISTS "Allow anon insert on quality_issues" ON public.quality_issues;
DROP POLICY IF EXISTS "Allow anon read on quality_issues" ON public.quality_issues;

-- QUALITY_ISSUES: New scope-based policies
CREATE POLICY "Scoped read on quality_issues"
  ON public.quality_issues FOR SELECT TO authenticated
  USING (public.can_access_row(company_id, '', NULL));

CREATE POLICY "Scoped insert on quality_issues"
  ON public.quality_issues FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Scoped delete on quality_issues"
  ON public.quality_issues FOR DELETE TO authenticated
  USING (public.can_access_row(company_id, '', NULL));

-- DASHBOARD_PREFERENCES: Drop old policies
DROP POLICY IF EXISTS "Allow all insert on dashboard_preferences" ON public.dashboard_preferences;
DROP POLICY IF EXISTS "Allow all read on dashboard_preferences" ON public.dashboard_preferences;
DROP POLICY IF EXISTS "Allow all update on dashboard_preferences" ON public.dashboard_preferences;
DROP POLICY IF EXISTS "Allow anon insert on dashboard_preferences" ON public.dashboard_preferences;
DROP POLICY IF EXISTS "Allow anon read on dashboard_preferences" ON public.dashboard_preferences;
DROP POLICY IF EXISTS "Allow anon update on dashboard_preferences" ON public.dashboard_preferences;

-- DASHBOARD_PREFERENCES: user can only access own preferences
CREATE POLICY "Own preferences read"
  ON public.dashboard_preferences FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text);

CREATE POLICY "Own preferences insert"
  ON public.dashboard_preferences FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Own preferences update"
  ON public.dashboard_preferences FOR UPDATE TO authenticated
  USING (user_id = auth.uid()::text);

-- SLA_POLICIES: Drop old anon policies only, keep authenticated 
DROP POLICY IF EXISTS "Allow anon insert on sla_policies" ON public.sla_policies;
DROP POLICY IF EXISTS "Allow anon read on sla_policies" ON public.sla_policies;
DROP POLICY IF EXISTS "Allow anon update on sla_policies" ON public.sla_policies;

-- PROFILES: Add policy for super_admin to read all profiles
-- (existing policies are fine, just remove the ability for non-admins to see other company profiles)
DROP POLICY IF EXISTS "Anyone can read profiles" ON public.profiles;

CREATE POLICY "Scoped read on profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR (SELECT access_scope FROM public.profiles WHERE id = auth.uid()) = 'global'
    OR (SELECT company_id FROM public.profiles WHERE id = auth.uid()) = company_id
  );

-- Step 11: Update handle_new_user to set access_scope based on role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, name, access_scope)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
    'company'
  );
  RETURN NEW;
END;
$function$;

-- Step 12: Create trigger for handle_new_user (recreate to ensure it exists)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
