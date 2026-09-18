-- ============================================================
-- 046_seed_delta_lgas_and_areas.sql
--
-- Migration 005 created the lgas/areas tables but never seeded any
-- rows into them -- for every state, including Delta, which is the
-- one state actually open for business (is_active = true). That left
-- the LGA/Area dropdowns correctly wired up but permanently empty:
-- selecting Delta would call GET /locations/states/:id/lgas and get
-- back an empty array every time.
--
-- This seeds Delta State's real 25 Local Government Areas (verified
-- against Delta State's own senatorial-district administrative
-- listing and cross-checked per-LGA against Wikipedia), plus each
-- LGA's headquarters town as its primary Area, plus a handful of
-- additional well-documented towns/communities for the LGAs with the
-- most population/economic activity (Warri South, Uvwie, Oshimili
-- South, Sapele) -- since those matter most for a job marketplace.
-- The remaining LGAs get their headquarters town only, rather than
-- padding the list with towns we can't verify actually belong to
-- that specific LGA.
-- ============================================================

INSERT INTO lgas (state_id, name)
SELECT states.id, x.name
FROM states
CROSS JOIN (VALUES
  ('Aniocha North'),
  ('Aniocha South'),
  ('Bomadi'),
  ('Burutu'),
  ('Ethiope East'),
  ('Ethiope West'),
  ('Ika North East'),
  ('Ika South'),
  ('Isoko North'),
  ('Isoko South'),
  ('Ndokwa East'),
  ('Ndokwa West'),
  ('Okpe'),
  ('Oshimili North'),
  ('Oshimili South'),
  ('Patani'),
  ('Sapele'),
  ('Udu'),
  ('Ughelli North'),
  ('Ughelli South'),
  ('Ukwuani'),
  ('Uvwie'),
  ('Warri North'),
  ('Warri South'),
  ('Warri South West')
) AS x(name)
WHERE states.name = 'Delta'
ON CONFLICT (state_id, name) DO NOTHING;

INSERT INTO areas (lga_id, name)
SELECT lgas.id, x.area_name
FROM lgas
JOIN states ON states.id = lgas.state_id AND states.name = 'Delta'
JOIN (VALUES
  ('Aniocha North', 'Issele-Uku'),
  ('Aniocha South', 'Ogwashi-Uku'),
  ('Bomadi', 'Bomadi'),
  ('Burutu', 'Burutu'),
  ('Ethiope East', 'Isiokolo'),
  ('Ethiope East', 'Abraka'),
  ('Ethiope West', 'Oghara'),
  ('Ika North East', 'Owa-Oyibu'),
  ('Ika South', 'Agbor'),
  ('Isoko North', 'Ozoro'),
  ('Isoko South', 'Oleh'),
  ('Ndokwa East', 'Aboh'),
  ('Ndokwa West', 'Kwale'),
  ('Okpe', 'Orerokpe'),
  ('Oshimili North', 'Akwukwu-Igbo'),
  ('Oshimili South', 'Asaba'),
  ('Oshimili South', 'Okwe'),
  ('Oshimili South', 'Anwai'),
  ('Oshimili South', 'Cable Point'),
  ('Oshimili South', 'Okpanam'),
  ('Patani', 'Patani'),
  ('Sapele', 'Sapele'),
  ('Sapele', 'Amukpe'),
  ('Sapele', 'Elume'),
  ('Sapele', 'Ugborhen'),
  ('Udu', 'Otor-Udu'),
  ('Ughelli North', 'Ughelli'),
  ('Ughelli South', 'Otu-Jeremi'),
  ('Ukwuani', 'Obiaruku'),
  ('Uvwie', 'Effurun'),
  ('Uvwie', 'Ekpan'),
  ('Uvwie', 'Enerhen'),
  ('Uvwie', 'Ugbokodo'),
  ('Uvwie', 'Ugboroke'),
  ('Warri North', 'Koko'),
  ('Warri South', 'Warri'),
  ('Warri South', 'Okere'),
  ('Warri South', 'Ubeji'),
  ('Warri South', 'Ode-Itsekiri'),
  ('Warri South', 'Pessu'),
  ('Warri South', 'Igbudu'),
  ('Warri South', 'Ogunu'),
  ('Warri South West', 'Ogbe-Ijoh')
) AS x(lga_name, area_name) ON x.lga_name = lgas.name
ON CONFLICT (lga_id, name) DO NOTHING;
