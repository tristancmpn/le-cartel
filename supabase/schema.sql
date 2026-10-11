-- Le Cartel : schéma Supabase
-- À coller une seule fois dans Supabase > SQL Editor > New query, puis "Run".

create extension if not exists pgcrypto;

-- ---------- Colocs ----------
create table if not exists members (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  emoji      text not null default '🙂',
  color      text not null default '--m1',
  active     boolean not null default true,
  notif      jsonb not null default '{"mine":true,"mineHour":"18:00","mineFreq":"jour","monday":true,"midweek":true,"midDay":"mercredi","stolen":true,"open":true}',
  created_at timestamptz not null default now()
);

-- ---------- Tâches quotidiennes ----------
create table if not exists daily_tasks (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  short      text not null,
  position   int  not null default 0,
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists daily_logs (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references daily_tasks(id) on delete cascade,
  member_id  uuid not null references members(id) on delete cascade,
  done_at    timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists daily_logs_done_at on daily_logs (done_at);

-- ---------- Grosses tâches ----------
create table if not exists catalogue (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  position   int  not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists week_tasks (
  id           uuid primary key default gen_random_uuid(),
  week_start   date not null,                 -- lundi de la semaine
  name         text not null,
  members      uuid[] not null default '{}',  -- colocs inscrits
  done_by      uuid[] not null default '{}',  -- colocs crédités quand c'est fait
  done_at      timestamptz,
  late         boolean not null default false, -- reportée d'une semaine précédente
  carried_from uuid unique references week_tasks(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists week_tasks_week on week_tasks (week_start);

-- Reporte dans la semaine p_week les tâches pas faites des semaines précédentes.
-- Idempotent : une tâche n'est reportée qu'une fois (carried_from unique).
create or replace function rollover_week(p_week date) returns int
language sql as $$
  with ins as (
    insert into week_tasks (week_start, name, members, late, carried_from)
    select p_week, w.name, w.members, true, w.id
    from week_tasks w
    where w.week_start < p_week
      and w.done_at is null
      and not exists (select 1 from week_tasks c where c.carried_from = w.id)
    on conflict (carried_from) do nothing
    returning 1
  )
  select count(*)::int from ins;
$$;

-- ---------- Notifications ----------
create table if not exists push_subscriptions (
  endpoint   text primary key,
  member_id  uuid not null references members(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

-- Messages à envoyer dès que possible (ex. « Hugo a repris ta tâche »)
create table if not exists notify_queue (
  id         bigserial primary key,
  member_id  uuid not null references members(id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text not null,
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);

-- Évite d'envoyer deux fois le même rappel
create table if not exists notif_sent (
  key     text primary key,
  sent_at timestamptz not null default now()
);

-- ---------- Accès ----------
-- Pas de comptes : quiconque a le lien de l'app peut lire et écrire (choix de la coloc).
do $$
declare t text;
begin
  foreach t in array array['members','daily_tasks','daily_logs','catalogue','week_tasks','push_subscriptions','notify_queue','notif_sent'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists open_access on %I', t);
    execute format('create policy open_access on %I for all to anon, authenticated using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on %I to anon, authenticated', t);
  end loop;
end $$;
grant usage, select on all sequences in schema public to anon, authenticated;
grant execute on function rollover_week(date) to anon, authenticated;

-- Mises à jour en direct entre les téléphones
do $$
declare t text;
begin
  foreach t in array array['members','daily_tasks','daily_logs','catalogue','week_tasks'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ---------- Données de départ ----------
insert into daily_tasks (name, short, position)
select * from (values
  ('Vider le lave-vaisselle', 'Lave-v.',   1),
  ('Balai cuisine',           'Balai',     2),
  ('Sortir les poubelles',    'Poubelles', 3)
) v(name, short, position)
where not exists (select 1 from daily_tasks);

insert into catalogue (name, position) values
  ('Aspirateur appart', 1), ('Salle de bain', 2), ('Serpillère', 3),
  ('Four', 4), ('Frigo', 5), ('Plaques + hotte', 6)
on conflict (name) do nothing;
