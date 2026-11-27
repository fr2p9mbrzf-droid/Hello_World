-- MY LIFE: private training log. Requires journal-setup.sql (approved member system).
-- Rerunnable; does not remove existing records.
begin;
create table if not exists public.training_records (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 workout_date date not null default current_date,
 exercise text not null check (char_length(btrim(exercise)) between 1 and 100),
 weight_kg numeric(7,2) check (weight_kg >= 0 and weight_kg <= 10000),
 reps integer not null check (reps between 1 and 1000),
 sets integer not null check (sets between 1 and 100),
 note text not null default '' check (char_length(note)<=2000),
 created_at timestamptz not null default now()
);
create index if not exists training_records_owner_date on public.training_records(owner_id,workout_date desc,created_at desc);
alter table public.training_records enable row level security;
revoke all on public.training_records from public,anon,authenticated;
grant select,insert,update,delete on public.training_records to authenticated;
drop policy if exists "training own read" on public.training_records;
drop policy if exists "training own insert" on public.training_records;
drop policy if exists "training own update" on public.training_records;
drop policy if exists "training own delete" on public.training_records;
create policy "training own read" on public.training_records for select to authenticated
using (owner_id=auth.uid());
create policy "training own insert" on public.training_records for insert to authenticated
with check (owner_id=auth.uid() and public.journal_is_approved(auth.uid()));
create policy "training own update" on public.training_records for update to authenticated
using (owner_id=auth.uid() and public.journal_is_approved(auth.uid()))
with check (owner_id=auth.uid() and public.journal_is_approved(auth.uid()));
create policy "training own delete" on public.training_records for delete to authenticated
using (owner_id=auth.uid());
commit;
select 'training setup OK' as result;
