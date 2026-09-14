-- ============================================================
-- 006_create_categories_and_skills.sql
-- Service/job categories and the skills used to tag worker
-- profiles, services, and jobs for matching and search.
-- ============================================================

CREATE TABLE IF NOT EXISTS categories (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                VARCHAR(120) NOT NULL,
  slug                VARCHAR(140) NOT NULL UNIQUE,
  parent_category_id  UUID REFERENCES categories(id) ON DELETE SET NULL,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories (parent_category_id);
CREATE INDEX IF NOT EXISTS idx_categories_active ON categories (is_active);

CREATE TABLE IF NOT EXISTS skills (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id   UUID REFERENCES categories(id) ON DELETE SET NULL,
  name          VARCHAR(120) NOT NULL,
  slug          VARCHAR(140) NOT NULL UNIQUE,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_skills_category_id ON skills (category_id);
CREATE INDEX IF NOT EXISTS idx_skills_active ON skills (is_active);
