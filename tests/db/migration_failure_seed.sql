\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');

insert into public.meals (id, owner_id, input_source) values (
  '30000000-0000-4000-8000-0000000000d1',
  '22222222-2222-4222-8222-222222222222',
  'text'
);

-- This row is legal under 0001 because the legacy FK checks meal_id only, but
-- it is deliberately cross-owner and must make 0002 validation fail.
insert into public.meal_items (
  id, meal_id, owner_id, recognized_name, portion_text, estimated_grams,
  oil_level, confidence, recognition_source, recognized_type,
  nutrition_snapshot
) values (
  '50000000-0000-4000-8000-0000000000d1',
  '30000000-0000-4000-8000-0000000000d1',
  '11111111-1111-4111-8111-111111111111',
  'dirty cross-owner item', '100g', 100,
  'none', 1, 'text', 'food', '{}'::jsonb
);
