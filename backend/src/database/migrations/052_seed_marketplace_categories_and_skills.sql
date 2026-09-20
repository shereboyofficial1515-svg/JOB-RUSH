-- ============================================================
-- 052_seed_marketplace_categories_and_skills.sql
-- Before this migration, `categories` had exactly one real row
-- ("Web Development") and `skills` had zero active rows, even though
-- the homepage's "Popular categories" strip already hardcoded links
-- to 7 categories (Artisans & Trades, Tech & Digital, Home Services,
-- Events & Media, Beauty & Wellness, Logistics & Delivery, Admin &
-- Support) that never actually existed in the database -- clicking
-- any of them went to an unfiltered job list, since jobs.html never
-- read the category param either. That taxonomy was clearly the
-- intended one (a previous developer named it and wired links to it),
-- it just never got created for real. This migration creates it for
-- real, plus a realistic starter skill list per category, so the
-- category system and skill pickers reflect actual, searchable data
-- instead of an empty shell -- not invented filler, the taxonomy the
-- app already declared it should have.
-- ============================================================

INSERT INTO categories (name, slug, sort_order) VALUES
  ('Artisans & Trades', 'artisans-trades', 10),
  ('Tech & Digital', 'tech-digital', 20),
  ('Home Services', 'home-services', 30),
  ('Events & Media', 'events-media', 40),
  ('Beauty & Wellness', 'beauty-wellness', 50),
  ('Logistics & Delivery', 'logistics-delivery', 60),
  ('Admin & Support', 'admin-support', 70)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO skills (category_id, name, slug)
SELECT c.id, s.name, s.slug FROM (VALUES
  ('artisans-trades', 'Electrician', 'electrician'),
  ('artisans-trades', 'Plumber', 'plumber'),
  ('artisans-trades', 'Carpenter', 'carpenter'),
  ('artisans-trades', 'Painter', 'painter'),
  ('artisans-trades', 'Mechanic', 'mechanic'),
  ('artisans-trades', 'Generator Repair', 'generator-repair'),
  ('artisans-trades', 'AC Repair & Installation', 'ac-repair-installation'),
  ('artisans-trades', 'Tailor / Fashion Designer', 'tailor-fashion-designer'),

  ('tech-digital', 'Web Development', 'web-development-skill'),
  ('tech-digital', 'Mobile App Development', 'mobile-app-development'),
  ('tech-digital', 'Graphic Design', 'graphic-design'),
  ('tech-digital', 'Social Media Management', 'social-media-management'),
  ('tech-digital', 'Data Entry', 'data-entry'),
  ('tech-digital', 'IT Support', 'it-support'),

  ('home-services', 'Cleaning Services', 'cleaning-services'),
  ('home-services', 'Laundry', 'laundry'),
  ('home-services', 'Gardening & Landscaping', 'gardening-landscaping'),
  ('home-services', 'Home Repairs', 'home-repairs'),
  ('home-services', 'Interior Decoration', 'interior-decoration'),

  ('events-media', 'Photography', 'photography'),
  ('events-media', 'Videography', 'videography'),
  ('events-media', 'Event Planning', 'event-planning'),
  ('events-media', 'MC / Compere', 'mc-compere'),
  ('events-media', 'DJ Services', 'dj-services'),

  ('beauty-wellness', 'Hair Styling', 'hair-styling'),
  ('beauty-wellness', 'Makeup Artist', 'makeup-artist'),
  ('beauty-wellness', 'Nail Technician', 'nail-technician'),
  ('beauty-wellness', 'Massage Therapy', 'massage-therapy'),

  ('logistics-delivery', 'Dispatch Rider', 'dispatch-rider'),
  ('logistics-delivery', 'Moving Services', 'moving-services'),
  ('logistics-delivery', 'Courier', 'courier'),

  ('admin-support', 'Virtual Assistant', 'virtual-assistant'),
  ('admin-support', 'Bookkeeping', 'bookkeeping'),
  ('admin-support', 'Customer Service', 'customer-service')
) AS s(category_slug, name, slug)
JOIN categories c ON c.slug = s.category_slug
ON CONFLICT (slug) DO NOTHING;
