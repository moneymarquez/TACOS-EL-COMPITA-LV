-- Idempotent seed. Only facts from the build brief - nothing invented.
-- Everything here is editable in /admin afterwards.
INSERT OR IGNORE INTO trucks (id, label, active, sort_order) VALUES (1, 'Truck 1', 1, 1);
INSERT OR IGNORE INTO trucks (id, label, active, sort_order) VALUES (2, 'Truck 2', 1, 2);

INSERT INTO menu_categories (name, sort_order)
  SELECT 'Tacos', 1 WHERE NOT EXISTS (SELECT 1 FROM menu_categories WHERE name = 'Tacos');
INSERT INTO menu_categories (name, sort_order)
  SELECT 'Drinks', 2 WHERE NOT EXISTS (SELECT 1 FROM menu_categories WHERE name = 'Drinks');

INSERT OR IGNORE INTO site_settings (key, value) VALUES
  ('hero_headline',        'Steak cut fresh every morning.'),
  ('hero_headline_accent', '$3 a taco.'),
  ('hero_subline',         'Street tacos and ice-cold Mexican Coke from two trucks that started in Las Vegas and now park in West Valley and West Jordan.'),
  ('location_headline',    'Two trucks. West Valley & West Jordan. Updated every morning.'),
  ('menu_headline',        'Every taco, three dollars.'),
  ('menu_lede',            'Doubled corn tortillas, onion, cilantro, lime, red and green salsa. Cash and card at the window.'),
  ('story_headline',       'Started in Vegas. Parked in Utah. Steak cut every morning.'),
  ('story_text',           'El Compita began as a single stand in Las Vegas. Two trucks now run around West Valley and West Jordan, Utah, and a lot of the regulars followed. The steak is not pre-cut or frozen. It is broken down by hand each morning before the grill comes on, and it is why the asada tastes the way it does.'),
  ('story_quote',          'One taco stand in every city.'),
  ('catering_copy',        'Backyards, work lunches, quinceañeras, ballfields. The truck parks on site and serves from the window, or we set up a steak taco bar with tortillas, salsas and Mexican Coke on ice. Tell us the date and headcount; we will reply with a quote.'),
  ('phone',                ''),
  ('email',                ''),
  ('instagram_url',        ''),
  ('service_area',         'West Valley City and West Jordan, Utah'),
  ('hours_summary',        ''),
  ('google_rating',        ''),
  ('google_review_count',  ''),
  ('google_reviews_url',   ''),
  ('notify_email',         '');
