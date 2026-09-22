-- ============================================================
-- 062_add_worker_profile_cover.sql
-- Profile hero/cover photo — confirmed absent by a schema audit
-- (worker_profiles only had profile_picture_url, no cover). This is
-- deliberately separate from the profile picture: a wide banner shown
-- behind/above it in the profile hero, not the avatar itself.
-- Additive/nullable — existing profiles just render the default
-- cover treatment client-side until a worker sets one.
-- ============================================================

ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS cover_photo_url TEXT;
