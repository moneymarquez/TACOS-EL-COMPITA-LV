-- Idempotent seed. Only facts from the build brief - nothing invented.
-- Everything here is editable in /admin afterwards.
INSERT OR IGNORE INTO trucks (id, label, active, sort_order) VALUES (1, 'Truck 1', 1, 1);
INSERT OR IGNORE INTO trucks (id, label, active, sort_order) VALUES (2, 'Truck 2', 1, 2);

INSERT INTO menu_categories (name, sort_order)
  SELECT 'Tacos', 1 WHERE NOT EXISTS (SELECT 1 FROM menu_categories WHERE name = 'Tacos');
INSERT INTO menu_categories (name, sort_order)
  SELECT 'Drinks', 2 WHERE NOT EXISTS (SELECT 1 FROM menu_categories WHERE name = 'Drinks');

INSERT OR IGNORE INTO site_settings (key, value) VALUES
  ('hero_headline',   'Street tacos. Steak cut fresh every day.'),
  ('hero_subline',    'Two trucks serving West Valley and West Jordan, Utah.'),
  ('story_text',      'El Compita started with Vegas roots and one idea: do a few things right. The steak is cut fresh every morning, the tacos are made to order, and the cooler is stocked with Mexican Coke. Today we run two trucks around West Valley and West Jordan. The goal has not changed since day one - a taco stand in every city.'),
  ('catering_copy',   'We bring the truck to you. Birthdays, work lunches, quinceaneras, block parties, and company events around the Salt Lake valley. Tell us the date and headcount and we will get back to you with a quote.'),
  ('phone',           ''),
  ('email',           ''),
  ('instagram_url',   ''),
  ('service_area',    'West Valley City and West Jordan, Utah'),
  ('hours_summary',   ''),
  ('google_rating',   ''),
  ('google_review_count', ''),
  ('google_reviews_url',  ''),
  ('notify_email',    '');
