INSERT INTO services (code, name, icon, base_price_cents, per_km_cents, min_distance_fee_cents, active, sort_order) VALUES
  ('flat_tyre', 'Flat tyre', 'tyre', 18000, 700, 2000, true, 1),
  ('jump_start', 'Jump-start', 'battery', 15000, 700, 2000, true, 2),
  ('essentials', 'Essentials', 'bag', 6000, 700, 2000, true, 3),
  ('towing', 'Towing', 'truck', 45000, 700, 2000, true, 4),
  ('fuel', 'Fuel top-up', 'fuel', 12000, 700, 2000, false, 5)
ON CONFLICT (code) DO NOTHING;