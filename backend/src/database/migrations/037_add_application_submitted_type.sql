-- ============================================================
-- 037_add_application_submitted_type.sql
-- The existing 'application_received' type notifies the hirer that
-- someone applied. There was no equivalent notifying the worker that
-- their own application went through — added for the "Application
-- Submitted" confirmation email (spec section 6.K).
-- ============================================================

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'application_submitted';
