-- Chain Lab: multi-step prompt chains, where each step is its own model call
-- and its output feeds the next step.
--   chain_lab_chains      a named chain
--   chain_lab_steps       its ordered steps (prompt, input, output format, model)
--   chain_lab_runs        one run of a chain on an image: the media it produced
--   chain_lab_run_steps   each step of a run: the exact prompt sent, the model, the output
--
-- These are separate from Punchline's prompt_chains, which are caption styles
-- whose steps are concatenated into a single call.
--
-- Superadmins only (profiles.is_superadmin, via public.is_superadmin() from
-- the admin app's admin.sql). Run once as the database owner; safe to re-run.

------------------------------------------------------------------------------
-- Tables
------------------------------------------------------------------------------

create table if not exists public.chain_lab_chains (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chain_lab_steps (
  id uuid primary key default gen_random_uuid(),
  chain_id uuid not null references public.chain_lab_chains (id) on delete cascade,
  -- 1, 2, 3... with no gaps. Filled in on insert; kept compact on delete.
  position integer not null check (position >= 1),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  -- What the step gets besides its prompt: the run's image, the previous
  -- step's output (for step 1: the run's starting text), or both.
  input text not null default 'previous' check (input in ('image', 'previous', 'both')),
  -- 'captions' asks the model for a JSON list of captions; 'text' is free text.
  output text not null default 'text' check (output in ('text', 'captions')),
  caption_count integer not null default 5 check (caption_count between 1 and 10),
  prompt text not null check (char_length(btrim(prompt)) between 1 and 4000),
  -- Null: use the active models in priority order (llm_models), falling through when one is busy.
  model_id uuid references public.llm_models (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Deferred so reordering can shuffle positions inside one transaction.
  constraint chain_lab_steps_position_key unique (chain_id, position) deferrable initially deferred
);

create table if not exists public.chain_lab_runs (
  id uuid primary key default gen_random_uuid(),
  chain_id uuid not null references public.chain_lab_chains (id) on delete cascade,
  chain_name text not null,
  image_id uuid references public.images (id) on delete set null,
  image_url text check (image_url is null or image_url ~ '^https://'),
  input_text text check (input_text is null or char_length(input_text) <= 2000),
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  error text,
  -- The last step's output: captions (when it writes captions) and/or text.
  captions jsonb not null default '[]' check (jsonb_typeof(captions) = 'array'),
  final_output text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.chain_lab_run_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.chain_lab_runs (id) on delete cascade,
  position integer not null check (position >= 1),
  -- A snapshot of the step when the run started, so editing the chain later
  -- doesn't rewrite history.
  name text not null,
  input text not null check (input in ('image', 'previous', 'both')),
  output text not null check (output in ('text', 'captions')),
  caption_count integer not null,
  prompt_template text not null,
  model_id uuid,
  status text not null default 'pending' check (status in ('pending', 'running', 'succeeded', 'failed')),
  prompt text,
  model text,
  result text,
  captions jsonb check (captions is null or jsonb_typeof(captions) = 'array'),
  error text,
  latency_ms integer,
  started_at timestamptz,
  completed_at timestamptz,
  unique (run_id, position)
);

create index if not exists chain_lab_steps_chain_idx on public.chain_lab_steps (chain_id);
create index if not exists chain_lab_runs_chain_idx on public.chain_lab_runs (chain_id, created_at desc);
create index if not exists chain_lab_runs_image_idx on public.chain_lab_runs (image_id);
create index if not exists chain_lab_runs_created_by_idx on public.chain_lab_runs (created_by);
create index if not exists chain_lab_chains_created_by_idx on public.chain_lab_chains (created_by);
create index if not exists chain_lab_steps_model_idx on public.chain_lab_steps (model_id);

------------------------------------------------------------------------------
-- Keeping step positions 1..n
------------------------------------------------------------------------------

drop trigger if exists chain_lab_chains_touch on public.chain_lab_chains;
create trigger chain_lab_chains_touch before update on public.chain_lab_chains
  for each row execute function public.touch_updated_at();

drop trigger if exists chain_lab_steps_touch on public.chain_lab_steps;
create trigger chain_lab_steps_touch before update on public.chain_lab_steps
  for each row execute function public.touch_updated_at();

-- New steps go on the end unless a position is given; a given position
-- shifts the steps at and after it down by one.
create or replace function public.chain_lab_place_step()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  -- Serialize edits to one chain's steps.
  perform 1 from public.chain_lab_chains where id = new.chain_id for update;
  select count(*) into v_count from public.chain_lab_steps where chain_id = new.chain_id;
  if new.position is null or new.position > v_count then
    new.position := v_count + 1;
  else
    new.position := greatest(new.position, 1);
    update public.chain_lab_steps
       set position = position + 1
     where chain_id = new.chain_id and position >= new.position;
  end if;
  return new;
end;
$$;

drop trigger if exists chain_lab_steps_place on public.chain_lab_steps;
create trigger chain_lab_steps_place before insert on public.chain_lab_steps
  for each row execute function public.chain_lab_place_step();

-- After deletes, close the gaps (step 3 of 3 becomes step 2 when step 2 goes).
create or replace function public.chain_lab_compact_steps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.chain_lab_steps s
     set position = r.rn
    from (
      select id, row_number() over (partition by chain_id order by position) as rn
        from public.chain_lab_steps
       where chain_id in (select distinct chain_id from deleted)
    ) r
   where s.id = r.id and s.position <> r.rn;
  return null;
end;
$$;

drop trigger if exists chain_lab_steps_compact on public.chain_lab_steps;
create trigger chain_lab_steps_compact after delete on public.chain_lab_steps
  referencing old table as deleted
  for each statement execute function public.chain_lab_compact_steps();

-- Moves a step to a new position (1-based), shifting the steps in between.
-- Runs as the caller, so RLS decides who may do it.
create or replace function public.chain_lab_move_step(p_step uuid, p_position integer)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_chain uuid;
  v_old integer;
  v_count integer;
  v_new integer;
begin
  select chain_id, position into v_chain, v_old from public.chain_lab_steps where id = p_step;
  if v_chain is null then
    raise exception 'step not found' using errcode = 'P0002';
  end if;
  perform 1 from public.chain_lab_chains where id = v_chain for update;
  select count(*) into v_count from public.chain_lab_steps where chain_id = v_chain;
  v_new := greatest(1, least(coalesce(p_position, v_old), v_count));
  if v_new = v_old then
    return;
  end if;

  if v_new < v_old then
    update public.chain_lab_steps set position = position + 1
     where chain_id = v_chain and position >= v_new and position < v_old;
  else
    update public.chain_lab_steps set position = position - 1
     where chain_id = v_chain and position > v_old and position <= v_new;
  end if;
  update public.chain_lab_steps set position = v_new where id = p_step;
end;
$$;

revoke execute on function public.chain_lab_move_step(uuid, integer) from public, anon;
grant execute on function public.chain_lab_move_step(uuid, integer) to authenticated;
revoke execute on function public.chain_lab_place_step() from public, anon, authenticated;
revoke execute on function public.chain_lab_compact_steps() from public, anon, authenticated;

------------------------------------------------------------------------------
-- Row level security: superadmins only, for everything
------------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['chain_lab_chains', 'chain_lab_steps', 'chain_lab_runs', 'chain_lab_run_steps'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists "Superadmins only" on public.%I', t);
    execute format(
      'create policy "Superadmins only" on public.%I for all to authenticated
         using ((select public.is_superadmin())) with check ((select public.is_superadmin()))',
      t
    );
  end loop;
end;
$$;

------------------------------------------------------------------------------
-- An example chain to start from
------------------------------------------------------------------------------

do $$
declare
  v_chain uuid;
begin
  if not exists (select 1 from public.chain_lab_chains) then
    insert into public.chain_lab_chains (name, description, created_by)
    values (
      'Describe → Find the joke → Captions',
      'The classic three-step chain: describe the photo, find what''s funny about it, then write five short captions.',
      null
    )
    returning id into v_chain;

    insert into public.chain_lab_steps (chain_id, position, name, input, output, caption_count, prompt) values
      (v_chain, 1, 'Describe the image', 'image', 'text', 5,
       'Describe this image in plain, specific detail: the setting, the people or animals and what they''re doing, facial expressions, any text, and anything odd or out of place. Don''t guess who real people are. 4-6 sentences.'),
      (v_chain, 2, 'Find the funny', 'previous', 'text', 5,
       'Here is a description of a photo:

{{previous}}

What''s funny about this? List 3 different comedic angles (an exaggeration, a relatable confession, an absurd twist...), each in one or two sentences. Keep it PG-13 and punch up, never down.'),
      (v_chain, 3, 'Write captions', 'both', 'captions', 5,
       'Using the photo and these comedic angles:

{{previous}}

Write five short, funny captions for the photo, for college students in New York. Each under 120 characters, each a different angle. No hashtags or numbering.');
  end if;
end;
$$;
