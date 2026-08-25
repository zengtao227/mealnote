#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to a disposable PostgreSQL database.}"

PSQL=(psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1)
USER_A='11111111-1111-4111-8111-111111111111'
USER_B='22222222-2222-4222-8222-222222222222'
MEAL_A='30000000-0000-4000-8000-0000000000c1'
ADVISORY_CLASS=424242
TMP_FILES=()
DIRTY_DB=''

cleanup() {
  for file in "${TMP_FILES[@]:-}"; do
    rm -f "${file}" || true
  done

  if [[ -n "${DIRTY_DB}" ]]; then
    "${PSQL[@]}" -c "drop database if exists \"${DIRTY_DB}\" with (force)" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

new_log() {
  local file
  file="$(mktemp)"
  TMP_FILES+=("${file}")
  printf '%s\n' "${file}"
}

wait_for_advisory_lock() {
  local key="$1"
  local attempt held

  for attempt in $(seq 1 80); do
    held="$("${PSQL[@]}" -Atc "select exists (select 1 from pg_locks where locktype = 'advisory' and classid = ${ADVISORY_CLASS} and objid = ${key} and granted)")"
    if [[ "${held}" == 't' ]]; then
      return 0
    fi
    sleep 0.1
  done

  echo "Timed out waiting for advisory test marker ${key}" >&2
  return 1
}

assert_running() {
  local pid="$1"
  local label="$2"

  sleep 0.35
  if ! kill -0 "${pid}" 2>/dev/null; then
    echo "Expected ${label} to be blocked by catalog row locking" >&2
    return 1
  fi
}

run_parent_first_case() {
  local table="$1"
  local catalog_id="$2"
  local ref_column="$3"
  local recognized_type="$4"
  local item_id="$5"
  local marker="$6"
  local label="$7"
  local parent_log child_log parent_pid child_pid

  parent_log="$(new_log)"
  child_log="$(new_log)"

  "${PSQL[@]}" >"${parent_log}" 2>&1 <<SQL &
set statement_timeout = '8s';
begin;
update public.${table}
set owner_id = '${USER_B}'
where id = '${catalog_id}';
select pg_advisory_xact_lock(${ADVISORY_CLASS}, ${marker});
select pg_sleep(2);
commit;
SQL
  parent_pid=$!

  wait_for_advisory_lock "${marker}"

  "${PSQL[@]}" >"${child_log}" 2>&1 <<SQL &
set statement_timeout = '8s';
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '${USER_A}', true);
insert into public.meal_items (
  id, meal_id, owner_id, recognized_name, portion_text, estimated_grams,
  oil_level, confidence, recognition_source, recognized_type, ${ref_column},
  nutrition_snapshot
) values (
  '${item_id}', '${MEAL_A}', '${USER_A}',
  '${label}', '100g', 100, 'none', 1, 'text', '${recognized_type}',
  '${catalog_id}', '{}'::jsonb
);
commit;
SQL
  child_pid=$!

  assert_running "${child_pid}" "${label} child insert"

  if ! wait "${parent_pid}"; then
    echo "Parent-first owner update unexpectedly failed: ${label}" >&2
    cat "${parent_log}" >&2
    return 1
  fi

  if wait "${child_pid}"; then
    echo "Parent-first child insert unexpectedly succeeded: ${label}" >&2
    cat "${child_log}" >&2
    return 1
  fi
}

run_child_first_case() {
  local table="$1"
  local catalog_id="$2"
  local ref_column="$3"
  local recognized_type="$4"
  local item_id="$5"
  local marker="$6"
  local label="$7"
  local parent_log child_log parent_pid child_pid

  parent_log="$(new_log)"
  child_log="$(new_log)"

  "${PSQL[@]}" >"${child_log}" 2>&1 <<SQL &
set statement_timeout = '8s';
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '${USER_A}', true);
insert into public.meal_items (
  id, meal_id, owner_id, recognized_name, portion_text, estimated_grams,
  oil_level, confidence, recognition_source, recognized_type, ${ref_column},
  nutrition_snapshot
) values (
  '${item_id}', '${MEAL_A}', '${USER_A}',
  '${label}', '100g', 100, 'none', 1, 'text', '${recognized_type}',
  '${catalog_id}', '{}'::jsonb
);
select pg_advisory_xact_lock(${ADVISORY_CLASS}, ${marker});
select pg_sleep(2);
commit;
SQL
  child_pid=$!

  wait_for_advisory_lock "${marker}"

  "${PSQL[@]}" >"${parent_log}" 2>&1 <<SQL &
set statement_timeout = '8s';
begin;
update public.${table}
set owner_id = '${USER_B}'
where id = '${catalog_id}';
commit;
SQL
  parent_pid=$!

  assert_running "${parent_pid}" "${label} parent owner update"

  if ! wait "${child_pid}"; then
    echo "Child-first insert unexpectedly failed: ${label}" >&2
    cat "${child_log}" >&2
    return 1
  fi

  if wait "${parent_pid}"; then
    echo "Child-first owner update unexpectedly succeeded: ${label}" >&2
    cat "${parent_log}" >&2
    return 1
  fi
}

database_url_for() {
  local database="$1"
  local without_query query base

  without_query="${DATABASE_URL%%\?*}"
  query=''
  if [[ "${DATABASE_URL}" == *'?'* ]]; then
    query="?${DATABASE_URL#*\?}"
  fi
  base="${without_query%/*}"
  printf '%s/%s%s\n' "${base}" "${database}" "${query}"
}

# Successful migration + sequential authorization/integrity regression tests.
"${PSQL[@]}" -f tests/db/auth_stub.sql

while IFS= read -r migration; do
  echo "Applying ${migration}"
  "${PSQL[@]}" -f "${migration}"
done < <(find supabase/migrations -maxdepth 1 -type f -name '*.sql' | sort)

"${PSQL[@]}" -f tests/db/owner_integrity.sql

# Deterministic concurrency coverage for both catalog types and both transaction
# orders. The advisory locks are only test markers; production serialization is
# provided by SELECT ... FOR SHARE in the trigger.
"${PSQL[@]}" -f tests/db/concurrency_seed.sql

run_parent_first_case \
  foods '10000000-0000-4000-8000-0000000000c1' food_id food \
  '50000000-0000-4000-8000-0000000000c1' 101 'food parent-first race'

run_child_first_case \
  foods '10000000-0000-4000-8000-0000000000c2' food_id food \
  '50000000-0000-4000-8000-0000000000c2' 102 'food child-first race'

run_parent_first_case \
  recipes '20000000-0000-4000-8000-0000000000c1' recipe_id recipe \
  '50000000-0000-4000-8000-0000000000c3' 103 'recipe parent-first race'

run_child_first_case \
  recipes '20000000-0000-4000-8000-0000000000c2' recipe_id recipe \
  '50000000-0000-4000-8000-0000000000c4' 104 'recipe child-first race'

"${PSQL[@]}" <<'SQL'
do $$
begin
  if exists (
    select 1
    from public.meal_items mi
    join public.foods f on f.id = mi.food_id
    where f.owner_id is not null and f.owner_id <> mi.owner_id
  ) then
    raise exception 'concurrency test left a cross-owner food reference';
  end if;

  if exists (
    select 1
    from public.meal_items mi
    join public.recipes r on r.id = mi.recipe_id
    where r.owner_id is not null and r.owner_id <> mi.owner_id
  ) then
    raise exception 'concurrency test left a cross-owner recipe reference';
  end if;
end;
$$;
SQL

echo 'Concurrent owner-integrity tests passed'

# Failure atomicity: build a separate 0001 database containing data that the
# owner-aware FK must reject. 0002 must fail as a whole and leave the legacy
# foreign keys in place.
DIRTY_DB="mealnote_dirty_${PPID}_${RANDOM}"
DIRTY_URL="$(database_url_for "${DIRTY_DB}")"
DIRTY_PSQL=(psql "${DIRTY_URL}" -X -v ON_ERROR_STOP=1)

"${PSQL[@]}" -c "create database \"${DIRTY_DB}\"" >/dev/null
"${DIRTY_PSQL[@]}" -f tests/db/auth_stub.sql >/dev/null
"${DIRTY_PSQL[@]}" -f supabase/migrations/0001_initial.sql >/dev/null
"${DIRTY_PSQL[@]}" -f tests/db/migration_failure_seed.sql >/dev/null

migration_log="$(new_log)"
if "${DIRTY_PSQL[@]}" -f supabase/migrations/0002_owner_integrity.sql >"${migration_log}" 2>&1; then
  echo 'Expected 0002_owner_integrity.sql to reject dirty cross-owner data' >&2
  cat "${migration_log}" >&2
  exit 1
fi

"${DIRTY_PSQL[@]}" <<'SQL'
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.meal_items'::regclass
      and conname = 'meal_items_meal_id_fkey'
  ) then
    raise exception 'failed migration removed legacy meal_items FK';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.ai_analysis_runs'::regclass
      and conname = 'ai_analysis_runs_meal_id_fkey'
  ) then
    raise exception 'failed migration removed legacy ai_analysis_runs FK';
  end if;

  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.meal_items'::regclass
      and conname = 'meal_items_meal_owner_fkey'
  ) then
    raise exception 'failed migration leaked the new meal_items FK';
  end if;

  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.ai_analysis_runs'::regclass
      and conname = 'ai_analysis_runs_meal_owner_fkey'
  ) then
    raise exception 'failed migration leaked the new ai_analysis_runs FK';
  end if;
end;
$$;
SQL

invalid_fk_log="$(new_log)"
if "${DIRTY_PSQL[@]}" -c "
  insert into public.meal_items (
    id, meal_id, owner_id, recognized_name, portion_text, estimated_grams,
    oil_level, confidence, recognition_source, recognized_type,
    nutrition_snapshot
  ) values (
    '50000000-0000-4000-8000-0000000000d2',
    '39999999-9999-4999-8999-999999999999',
    '${USER_A}', 'must fail old FK', '100g', 100,
    'none', 1, 'text', 'food', '{}'::jsonb
  )" >"${invalid_fk_log}" 2>&1; then
  echo 'Legacy meal FK no longer protects the database after failed migration' >&2
  cat "${invalid_fk_log}" >&2
  exit 1
fi

echo 'Failed migration rollback test passed'
echo 'owner integrity tests passed'
