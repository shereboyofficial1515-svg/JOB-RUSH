-- ============================================================
-- 045_seed_remaining_nigerian_states.sql
--
-- Migration 005 only seeded 6 states (Delta plus 5 others chosen
-- arbitrarily as examples). The location selector is supposed to let
-- a user pick ANY Nigerian state -- and see a clear "Delta only for
-- now" message for anything else -- not just the 6 that happened to
-- be seeded. This adds the remaining 31 states so all 36 states +
-- the FCT exist as real rows. All of them default to is_active =
-- false (the column's own DEFAULT), preserving the Delta-only launch
-- restriction exactly as migration 005 set it up -- this migration
-- only adds rows, it never touches the is_active flag on any state.
-- ============================================================

INSERT INTO states (name, is_active) VALUES
  ('Abia', false),
  ('Adamawa', false),
  ('Akwa Ibom', false),
  ('Bauchi', false),
  ('Bayelsa', false),
  ('Benue', false),
  ('Borno', false),
  ('Cross River', false),
  ('Ebonyi', false),
  ('Ekiti', false),
  ('Enugu', false),
  ('Gombe', false),
  ('Imo', false),
  ('Jigawa', false),
  ('Kaduna', false),
  ('Kano', false),
  ('Katsina', false),
  ('Kebbi', false),
  ('Kogi', false),
  ('Kwara', false),
  ('Nasarawa', false),
  ('Niger', false),
  ('Ogun', false),
  ('Ondo', false),
  ('Osun', false),
  ('Oyo', false),
  ('Plateau', false),
  ('Sokoto', false),
  ('Taraba', false),
  ('Yobe', false),
  ('Zamfara', false)
ON CONFLICT (name) DO NOTHING;
