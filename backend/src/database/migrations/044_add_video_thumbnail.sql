-- ============================================================
-- 044_add_video_thumbnail.sql
-- Portfolio video cards had no still image to show without loading
-- the whole video file — this stores a small generated poster frame
-- (extracted server-side during upload processing) alongside the
-- video's own storage_path, in the same public bucket. Nullable and
-- image-only in practice; unused for non-video media.
-- ============================================================

ALTER TABLE portfolio_media ADD COLUMN IF NOT EXISTS thumbnail_storage_path TEXT;
