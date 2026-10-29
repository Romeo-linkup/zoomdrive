INSERT INTO app_settings (key, value) VALUES
  ('commission_pct', '12'),
  ('road_factor', '1.3'),
  ('avg_speed_kmh', '40'),
  ('offer_radius_km', '25'),
  ('max_offers_per_request', '5'),
  ('request_expiry_seconds', '180'),
  ('provider_stale_seconds', '120'),
  ('cancel_fee_cents', '0')
ON CONFLICT (key) DO NOTHING;