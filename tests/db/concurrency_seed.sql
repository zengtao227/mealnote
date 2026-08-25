\set ON_ERROR_STOP on

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

insert into auth.users (id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222')
on conflict (id) do nothing;

insert into public.meals (id, owner_id, input_source) values (
  '30000000-0000-4000-8000-0000000000c1',
  '11111111-1111-4111-8111-111111111111',
  'text'
);

insert into public.foods (
  id, owner_id, canonical_name, kind,
  kcal_per_100g, protein_per_100g, fat_per_100g, carbs_per_100g,
  source_type, source_ref
) values
  (
    '10000000-0000-4000-8000-0000000000c1',
    '11111111-1111-4111-8111-111111111111',
    'concurrency food parent first', 'food',
    100, 10, 2, 12, 'test', 'concurrency-food-parent-first'
  ),
  (
    '10000000-0000-4000-8000-0000000000c2',
    '11111111-1111-4111-8111-111111111111',
    'concurrency food child first', 'food',
    100, 10, 2, 12, 'test', 'concurrency-food-child-first'
  );

insert into public.recipes (
  id, owner_id, name, yield_grams, source_type, source_ref
) values
  (
    '20000000-0000-4000-8000-0000000000c1',
    '11111111-1111-4111-8111-111111111111',
    'concurrency recipe parent first', 300,
    'test', 'concurrency-recipe-parent-first'
  ),
  (
    '20000000-0000-4000-8000-0000000000c2',
    '11111111-1111-4111-8111-111111111111',
    'concurrency recipe child first', 300,
    'test', 'concurrency-recipe-child-first'
  );
