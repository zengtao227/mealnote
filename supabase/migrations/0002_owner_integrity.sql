-- S1: make tenant ownership part of the database relationship itself.
--
-- Row-level security still controls which rows a user may access, but RLS alone
-- does not guarantee that two individually-owned rows belong to the same user.
-- These constraints/triggers keep cross-table references valid even for writes
-- performed by privileged server roles that bypass RLS.
--
-- Keep this migration atomic. In particular, a failed validation must never
-- leave the pre-existing foreign keys removed or otherwise weaken the schema.
begin;

-- Hold data-changing statements out for the migration. This closes the window
-- between validating existing catalog references and installing the triggers.
lock table
  public.meals,
  public.meal_items,
  public.ai_analysis_runs,
  public.foods,
  public.recipes
in share row exclusive mode;

-- A meal reference is only valid when both the id and owner match.
alter table public.meals
  add constraint meals_id_owner_key unique (id, owner_id);

-- Install and validate the stronger constraints before removing the old ones.
-- NOT VALID lets us keep the old FKs active while validation is performed.
alter table public.meal_items
  add constraint meal_items_meal_owner_fkey
  foreign key (meal_id, owner_id)
  references public.meals (id, owner_id)
  on delete cascade
  not valid;

alter table public.ai_analysis_runs
  add constraint ai_analysis_runs_meal_owner_fkey
  foreign key (meal_id, owner_id)
  references public.meals (id, owner_id)
  on delete set null (meal_id)
  not valid;

alter table public.meal_items
  validate constraint meal_items_meal_owner_fkey;

alter table public.ai_analysis_runs
  validate constraint ai_analysis_runs_meal_owner_fkey;

-- Only after both owner-aware FKs validate successfully may the legacy FKs go.
alter table public.meal_items
  drop constraint meal_items_meal_id_fkey;

alter table public.ai_analysis_runs
  drop constraint ai_analysis_runs_meal_id_fkey;

-- foods/recipes may be system-owned (owner_id is null) or private. Existing
-- rows must already satisfy "system or same owner" before installing triggers.
do $$
begin
  if exists (
    select 1
    from public.meal_items mi
    join public.foods f on f.id = mi.food_id
    where f.owner_id is not null
      and f.owner_id <> mi.owner_id
  ) then
    raise foreign_key_violation using
      message = 'existing meal_items contain a cross-owner food reference';
  end if;

  if exists (
    select 1
    from public.meal_items mi
    join public.recipes r on r.id = mi.recipe_id
    where r.owner_id is not null
      and r.owner_id <> mi.owner_id
  ) then
    raise foreign_key_violation using
      message = 'existing meal_items contain a cross-owner recipe reference';
  end if;
end;
$$;

-- Child writes take a SHARE row lock on each referenced catalog row. SHARE is
-- intentionally stronger than the KEY SHARE lock of the plain UUID FK: it also
-- conflicts with owner-changing UPDATEs that may otherwise use NO KEY UPDATE.
-- Under READ COMMITTED, a locking SELECT that waits for a concurrent UPDATE
-- re-checks the updated row before returning it.
create function public.enforce_meal_item_catalog_ownership()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  catalog_owner uuid;
begin
  if new.food_id is not null then
    select f.owner_id
      into catalog_owner
      from public.foods f
      where f.id = new.food_id
      for share;

    if not found then
      raise foreign_key_violation using
        message = 'meal item food reference does not exist';
    end if;

    if catalog_owner is not null and catalog_owner <> new.owner_id then
      raise foreign_key_violation using
        message = 'meal item food must be system-owned or owned by the meal item owner';
    end if;
  end if;

  if new.recipe_id is not null then
    select r.owner_id
      into catalog_owner
      from public.recipes r
      where r.id = new.recipe_id
      for share;

    if not found then
      raise foreign_key_violation using
        message = 'meal item recipe reference does not exist';
    end if;

    if catalog_owner is not null and catalog_owner <> new.owner_id then
      raise foreign_key_violation using
        message = 'meal item recipe must be system-owned or owned by the meal item owner';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_meal_item_catalog_ownership() from public;

create trigger meal_items_catalog_owner_integrity
before insert or update of owner_id, food_id, recipe_id
on public.meal_items
for each row
execute function public.enforce_meal_item_catalog_ownership();

-- Keep the invariant true if a privileged process changes a private catalog
-- row's owner after meal items already reference it. Moving a row to system
-- ownership (owner_id = null) remains valid because system rows are shareable.
--
-- This function is explicitly VOLATILE so each SQL query it executes uses a
-- fresh snapshot. If the UPDATE had to wait for a child transaction's SHARE
-- lock, the post-wait child lookup sees that newly committed reference.
create function public.enforce_catalog_owner_update_integrity()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if new.owner_id is not distinct from old.owner_id or new.owner_id is null then
    return new;
  end if;

  if tg_table_name = 'foods' and exists (
    select 1
    from public.meal_items mi
    where mi.food_id = new.id
      and mi.owner_id <> new.owner_id
  ) then
    raise foreign_key_violation using
      message = 'food owner change would create cross-owner meal item references';
  end if;

  if tg_table_name = 'recipes' and exists (
    select 1
    from public.meal_items mi
    where mi.recipe_id = new.id
      and mi.owner_id <> new.owner_id
  ) then
    raise foreign_key_violation using
      message = 'recipe owner change would create cross-owner meal item references';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_catalog_owner_update_integrity() from public;

create trigger foods_owner_update_integrity
before update of owner_id
on public.foods
for each row
execute function public.enforce_catalog_owner_update_integrity();

create trigger recipes_owner_update_integrity
before update of owner_id
on public.recipes
for each row
execute function public.enforce_catalog_owner_update_integrity();

-- Supporting indexes for FK actions and owner-change integrity checks.
create index meal_items_food_id_idx
  on public.meal_items (food_id)
  where food_id is not null;

create index meal_items_recipe_id_idx
  on public.meal_items (recipe_id)
  where recipe_id is not null;

create index ai_analysis_runs_meal_id_idx
  on public.ai_analysis_runs (meal_id)
  where meal_id is not null;

commit;
