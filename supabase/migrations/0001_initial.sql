create extension if not exists pgcrypto;

create type public.food_kind as enum ('food', 'recipe', 'drink', 'condiment');
create type public.oil_level as enum ('none', 'light', 'standard', 'heavy', 'unknown');
create type public.input_source as enum ('text', 'voice', 'image', 'mixed');

create table public.foods (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  canonical_name text not null,
  kind public.food_kind not null default 'food',
  kcal_per_100g numeric(8, 2) not null check (kcal_per_100g >= 0),
  protein_per_100g numeric(8, 2) not null check (protein_per_100g >= 0),
  fat_per_100g numeric(8, 2) not null check (fat_per_100g >= 0),
  carbs_per_100g numeric(8, 2) not null check (carbs_per_100g >= 0),
  uncertainty_ratio numeric(4, 3) not null default 0.10 check (uncertainty_ratio between 0 and 0.60),
  source_type text not null,
  source_ref text not null,
  created_at timestamptz not null default now(),
  unique nulls not distinct (owner_id, canonical_name)
);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  name text not null,
  yield_grams numeric(9, 2) not null check (yield_grams > 0),
  ingredient_snapshot jsonb not null default '[]'::jsonb,
  source_type text not null,
  source_ref text not null,
  created_at timestamptz not null default now(),
  unique nulls not distinct (owner_id, name)
);

create table public.user_portion_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  reference_type text not null,
  grams numeric(8, 2) not null check (grams > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (owner_id, label)
);

create table public.meals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  input_source public.input_source not null,
  raw_input text,
  private_image_path text,
  status text not null default 'confirmed' check (status in ('draft', 'confirmed')),
  kcal numeric(9, 2) not null default 0,
  kcal_low numeric(9, 2) not null default 0,
  kcal_high numeric(9, 2) not null default 0,
  protein numeric(9, 2) not null default 0,
  fat numeric(9, 2) not null default 0,
  carbs numeric(9, 2) not null default 0,
  eaten_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.meal_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.meals(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  recognized_name text not null,
  portion_text text not null,
  estimated_grams numeric(8, 2) not null check (estimated_grams > 0),
  oil_level public.oil_level not null,
  confidence numeric(4, 3) not null check (confidence between 0 and 1),
  recognition_source public.input_source not null,
  recognized_type public.food_kind not null,
  food_id uuid references public.foods(id),
  recipe_id uuid references public.recipes(id),
  nutrition_snapshot jsonb not null,
  assumptions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table public.ai_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  meal_id uuid references public.meals(id) on delete set null,
  provider text not null,
  model text not null,
  schema_version text not null,
  structured_output jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.foods enable row level security;
alter table public.recipes enable row level security;
alter table public.user_portion_profiles enable row level security;
alter table public.meals enable row level security;
alter table public.meal_items enable row level security;
alter table public.ai_analysis_runs enable row level security;

create policy "read system or own foods" on public.foods for select
  using (owner_id is null or owner_id = auth.uid());
create policy "manage own foods" on public.foods for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "read system or own recipes" on public.recipes for select
  using (owner_id is null or owner_id = auth.uid());
create policy "manage own recipes" on public.recipes for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "manage own portions" on public.user_portion_profiles for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "manage own meals" on public.meals for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "manage own meal items" on public.meal_items for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "manage own ai runs" on public.ai_analysis_runs for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create index meals_owner_eaten_at_idx on public.meals (owner_id, eaten_at desc);
create index meal_items_meal_id_idx on public.meal_items (meal_id);
create index foods_canonical_name_idx on public.foods (canonical_name);
