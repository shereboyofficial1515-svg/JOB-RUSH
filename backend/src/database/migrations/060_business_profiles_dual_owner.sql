-- ============================================================
-- 060_business_profiles_dual_owner.sql
-- business_profiles/business_media were worker-only (worker_user_id
-- was the literal primary key), but a business can just as easily
-- belong to a hirer account (many hirers ARE small businesses/
-- companies posting jobs). Extends to support either owner instead
-- of creating a second, duplicate business-profile system for hirers.
--
-- worker_user_id being the PK meant it couldn't simply be made
-- nullable in place — a new surrogate `id` becomes the real PK, and
-- worker_user_id/hirer_user_id become two nullable, individually-
-- unique "owner" columns with a CHECK enforcing exactly one is set.
-- business_media moves from its own worker_user_id FK to referencing
-- business_profiles.id directly, so it doesn't need the same
-- worker/hirer branching duplicated a second time.
--
-- Preserves the one existing row rather than dropping/recreating —
-- confirmed via direct query before writing this that a real,
-- recently-recreated business profile exists in production.
-- ============================================================

-- business_media's own FK targets business_profiles(worker_user_id)
-- (the current PK) — must drop that dependent constraint before the
-- PK itself can move to the new surrogate `id` column.
ALTER TABLE business_media DROP CONSTRAINT IF EXISTS business_media_worker_user_id_fkey;

ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
UPDATE business_profiles SET id = gen_random_uuid() WHERE id IS NULL;
ALTER TABLE business_profiles ALTER COLUMN id SET NOT NULL;

ALTER TABLE business_profiles DROP CONSTRAINT IF EXISTS business_profiles_pkey;
ALTER TABLE business_profiles ADD CONSTRAINT business_profiles_pkey PRIMARY KEY (id);

ALTER TABLE business_profiles ALTER COLUMN worker_user_id DROP NOT NULL;
DO $$ BEGIN
  ALTER TABLE business_profiles ADD CONSTRAINT business_profiles_worker_user_id_key UNIQUE (worker_user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS hirer_user_id UUID REFERENCES hirer_profiles(user_id) ON DELETE CASCADE;
DO $$ BEGIN
  ALTER TABLE business_profiles ADD CONSTRAINT business_profiles_hirer_user_id_key UNIQUE (hirer_user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE business_profiles ADD CONSTRAINT chk_business_profile_owner CHECK (
    (worker_user_id IS NOT NULL AND hirer_user_id IS NULL) OR
    (worker_user_id IS NULL AND hirer_user_id IS NOT NULL)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- business_media: reference the profile, not the owner ----------
ALTER TABLE business_media ADD COLUMN IF NOT EXISTS business_profile_id UUID;
UPDATE business_media bm SET business_profile_id = bp.id
  FROM business_profiles bp WHERE bp.worker_user_id = bm.worker_user_id AND bm.business_profile_id IS NULL;

ALTER TABLE business_media DROP COLUMN IF EXISTS worker_user_id;
ALTER TABLE business_media ALTER COLUMN business_profile_id SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE business_media ADD CONSTRAINT business_media_business_profile_id_fkey
    FOREIGN KEY (business_profile_id) REFERENCES business_profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_business_media_profile ON business_media (business_profile_id, sort_order);
