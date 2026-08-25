\set ON_ERROR_STOP on

-- This test runs after tests/db/auth_stub.sql and all Supabase migrations have
-- been applied to a disposable PostgreSQL database.

begin;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

insert into auth.users (id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');

-- System catalog rows are deliberately shared (owner_id is null).
insert into public.foods (
  id, owner_id, canonical_name, kind,
  kcal_per_100g, protein_per_100g, fat_per_100g, carbs_per_100g,
  source_type, source_ref
) values (
  '10000000-0000-4000-8000-000000000001', null, 'system food', 'food',
  100, 10, 2, 12, 'test', 'system-food'
);

insert into public.recipes (
  id, owner_id, name, yield_grams, source_type, source_ref
) values (
  '20000000-0000-4000-8000-000000000001', null, 'system recipe', 300,
  'test', 'system-recipe'
);

create function pg_temp.expect_fk_failure(statement text, label text)
returns void
language plpgsql
as $$
begin
  begin
    execute statement;
  exception
    when foreign_key_violation then
      return;
  end;

  raise exception 'expected foreign_key_violation: %', label;
end;
$$;

create function pg_temp.assert_true(value boolean, label text)
returns void
language plpgsql
as $$
begin
  if not value then
    raise exception 'assertion failed: %', label;
  end if;
end;
$$;

-- User A creates private catalog data and meals through normal RLS policies.
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

insert into public.foods (
  id, owner_id, canonical_name, kind,
  kcal_per_100g, protein_per_100g, fat_per_100g, carbs_per_100g,
  source_type, source_ref
) values (
  '10000000-0000-4000-8000-00000000000a',
  '11111111-1111-4111-8111-111111111111',
  'user a food', 'food', 110, 11, 3, 13, 'test', 'user-a-food'
);

insert into public.recipes (
  id, owner_id, name, yield_grams, source_type, source_ref
) values (
  '20000000-0000-4000-8000-00000000000a',
  '11111111-1111-4111-8111-111111111111',
  'user a recipe', 320, 'test', 'user-a-recipe'
);

insert into public.meals (id, owner_id, input_source) values
  ('30000000-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-111111111111', 'text'),
  ('30000000-0000-4000-8000-00000000000c', '11111111-1111-4111-8111-111111111111', 'text');

-- User B creates separate private data and a meal.
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);

insert into public.foods (
  id, owner_id, canonical_name, kind,
  kcal_per_100g, protein_per_100g, fat_per_100g, carbs_per_100g,
  source_type, source_ref
) values (
  '10000000-0000-4000-8000-00000000000b',
  '22222222-2222-4222-8222-222222222222',
  'user b food', 'food', 120, 12, 4, 14, 'test', 'user-b-food'
);

insert into public.recipes (
  id, owner_id, name, yield_grams, source_type, source_ref
) values (
  '20000000-0000-4000-8000-00000000000b',
  '22222222-2222-4222-8222-222222222222',
  'user b recipe', 340, 'test', 'user-b-recipe'
);

insert into public.meals (id, owner_id, input_source) values (
  '30000000-0000-4000-8000-00000000000b',
  '22222222-2222-4222-8222-222222222222',
  'text'
);

-- User A may reference own and system rows.
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

insert into public.meal_items (
  id, meal_id, owner_id, recognized_name, portion_text, estimated_grams,
  oil_level, confidence, recognition_source, recognized_type, food_id,
  nutrition_snapshot
) values
  (
    '50000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-00000000000a',
    '11111111-1111-4111-8111-111111111111',
    'own food', '100g', 100, 'none', 1, 'text', 'food',
    '10000000-0000-4000-8000-00000000000a', '{}'::jsonb
  ),
  (
    '50000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-00000000000a',
    '11111111-1111-4111-8111-111111111111',
    'system food', '100g', 100, 'none', 1, 'text', 'food',
    '10000000-0000-4000-8000-000000000001', '{}'::jsonb
  );

insert into public.meal_items (
  id, meal_id, owner_id, recognized_name, portion_text, estimated_grams,
  oil_level, confidence, recognition_source, recognized_type, recipe_id,
  nutrition_snapshot
) values
  (
    '50000000-0000-4000-8000-000000000003',
    '30000000-0000-4000-8000-00000000000a',
    '11111111-1111-4111-8111-111111111111',
    'own recipe', '100g', 100, 'none', 1, 'text', 'recipe',
    '20000000-0000-4000-8000-00000000000a', '{}'::jsonb
  ),
  (
    '50000000-0000-4000-8000-000000000004',
    '30000000-0000-4000-8000-00000000000a',
    '11111111-1111-4111-8111-111111111111',
    'system recipe', '100g', 100, 'none', 1, 'text', 'recipe',
    '20000000-0000-4000-8000-000000000001', '{}'::jsonb
  );

-- Knowing another user's UUID is not enough to create a cross-tenant relation.
select pg_temp.expect_fk_failure($sql$
  insert into public.meal_items (
    id, meal_id, owner_id, recognized_name, portion_text, estimated_grams,
    oil_level, confidence, recognition_source, recognized_type,
    nutrition_snapshot
  ) values (
    '50000000-0000-4000-8000-000000000010',
    '30000000-0000-4000-8000-00000000000b',
    '11111111-1111-4111-8111-111111111111',
    'cross meal', '100g', 100, 'none', 1, 'text', 'food', '{}'::jsonb
  )
$sql$, 'user A -> user B meal');

select pg_temp.expect_fk_failure($sql$
  insert into public.meal_items (
    id, meal_id, owner_id, recognized_name, portion_text, estimated_grams,
    oil_level, confidence, recognition_source, recognized_type, food_id,
    nutrition_snapshot
  ) values (
    '50000000-0000-4000-8000-000000000011',
    '30000000-0000-4000-8000-00000000000a',
    '11111111-1111-4111-8111-111111111111',
    'cross food', '100g', 100, 'none', 1, 'text', 'food',
    '10000000-0000-4000-8000-00000000000b', '{}'::jsonb
  )
$sql$, 'user A -> user B private food');

select pg_temp.expect_fk_failure($sql$
  insert into public.meal_items (
    id, meal_id, owner_id, recognized_name, portion_text, estimated_grams,
    oil_level, confidence, recognition_source, recognized_type, recipe_id,
    nutrition_snapshot
  ) values (
    '50000000-0000-4000-8000-000000000012',
    '30000000-0000-4000-8000-00000000000a',
    '11111111-1111-4111-8111-111111111111',
    'cross recipe', '100g', 100, 'none', 1, 'text', 'recipe',
    '20000000-0000-4000-8000-00000000000b', '{}'::jsonb
  )
$sql$, 'user A -> user B private recipe');

select pg_temp.expect_fk_failure($sql$
  insert into public.ai_analysis_runs (
    id, owner_id, meal_id, provider, model, schema_version, structured_output
  ) values (
    '40000000-0000-4000-8000-000000000010',
    '11111111-1111-4111-8111-111111111111',
    '30000000-0000-4000-8000-00000000000b',
    'test', 'test-model', 'v1', '{}'::jsonb
  )
$sql$, 'user A ai run -> user B meal');

-- User B is blocked symmetrically.
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);

select pg_temp.expect_fk_failure($sql$
  insert into public.ai_analysis_runs (
    id, owner_id, meal_id, provider, model, schema_version, structured_output
  ) values (
    '40000000-0000-4000-8000-000000000011',
    '22222222-2222-4222-8222-222222222222',
    '30000000-0000-4000-8000-00000000000a',
    'test', 'test-model', 'v1', '{}'::jsonb
  )
$sql$, 'user B ai run -> user A meal');

-- Composite FK delete actions keep the owner invariant: meal_items cascade,
-- while ai_analysis_runs retains its owner and only clears meal_id.
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

insert into public.meal_items (
  id, meal_id, owner_id, recognized_name, portion_text, estimated_grams,
  oil_level, confidence, recognition_source, recognized_type,
  nutrition_snapshot
) values (
  '50000000-0000-4000-8000-000000000020',
  '30000000-0000-4000-8000-00000000000c',
  '11111111-1111-4111-8111-111111111111',
  'delete cascade item', '100g', 100, 'none', 1, 'text', 'food', '{}'::jsonb
);

insert into public.ai_analysis_runs (
  id, owner_id, meal_id, provider, model, schema_version, structured_output
) values (
  '40000000-0000-4000-8000-000000000020',
  '11111111-1111-4111-8111-111111111111',
  '30000000-0000-4000-8000-00000000000c',
  'test', 'test-model', 'v1', '{}'::jsonb
);

delete from public.meals
where id = '30000000-0000-4000-8000-00000000000c';

select pg_temp.assert_true(
  not exists (
    select 1 from public.meal_items
    where id = '50000000-0000-4000-8000-000000000020'
  ),
  'meal item should cascade-delete with its meal'
);

select pg_temp.assert_true(
  exists (
    select 1 from public.ai_analysis_runs
    where id = '40000000-0000-4000-8000-000000000020'
      and owner_id = '11111111-1111-4111-8111-111111111111'
      and meal_id is null
  ),
  'ai run should retain owner and clear only meal_id'
);

-- Privileged/server writes bypass RLS but must still obey database integrity.
reset role;

select pg_temp.expect_fk_failure($sql$
  insert into public.meal_items (
    id, meal_id, owner_id, recognized_name, portion_text, estimated_grams,
    oil_level, confidence, recognition_source, recognized_type, food_id,
    nutrition_snapshot
  ) values (
    '50000000-0000-4000-8000-000000000030',
    '30000000-0000-4000-8000-00000000000a',
    '11111111-1111-4111-8111-111111111111',
    'privileged cross food', '100g', 100, 'none', 1, 'text', 'food',
    '10000000-0000-4000-8000-00000000000b', '{}'::jsonb
  )
$sql$, 'privileged cross-owner food reference');

select pg_temp.expect_fk_failure($sql$
  update public.foods
  set owner_id = '22222222-2222-4222-8222-222222222222'
  where id = '10000000-0000-4000-8000-00000000000a'
$sql$, 'food owner transfer with existing user A references');

select pg_temp.expect_fk_failure($sql$
  update public.recipes
  set owner_id = '22222222-2222-4222-8222-222222222222'
  where id = '20000000-0000-4000-8000-00000000000a'
$sql$, 'recipe owner transfer with existing user A references');

select pg_temp.expect_fk_failure($sql$
  update public.meals
  set owner_id = '22222222-2222-4222-8222-222222222222'
  where id = '30000000-0000-4000-8000-00000000000a'
$sql$, 'meal owner transfer with existing references');

-- Moving a private catalog row to system ownership stays valid and shareable.
update public.foods
set owner_id = null
where id = '10000000-0000-4000-8000-00000000000a';

select pg_temp.assert_true(
  exists (
    select 1 from public.foods
    where id = '10000000-0000-4000-8000-00000000000a'
      and owner_id is null
  ),
  'private food may be promoted to a system row without breaking references'
);

rollback;

select 'owner integrity tests passed' as result;
