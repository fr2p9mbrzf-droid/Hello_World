-- MY LIFE: approved member journal rooms. Run once (safe to rerun).
-- Requires the existing vlog_owner table and is_vlog_owner() function.
begin;
create table if not exists public.journal_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
 email text not null default '',
 status text not null default 'pending' check (status in ('pending','approved','rejected','revoked')),
 requested_at timestamptz not null default now()
);
alter table public.journal_members enable row level security;
revoke all on public.journal_members from anon, authenticated;
grant select on public.journal_members to authenticated;
drop policy if exists "journal member self or admin" on public.journal_members;
create policy "journal member self or admin" on public.journal_members for select to authenticated
using (user_id=auth.uid() or public.is_vlog_owner());
insert into public.journal_members(user_id,display_name,email,status)
select o.user_id,'管理者',coalesce(u.email,''),'approved' from public.vlog_owner o join auth.users u on u.id=o.user_id
on conflict(user_id) do update set status='approved';

create table if not exists public.journal_entries (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 entry_date date not null default current_date,
 mood text not null default '😌 普通' check (char_length(mood)<=40),
 title text not null default '' check (char_length(title)<=200),
 body text not null check (char_length(btrim(body)) between 1 and 30000),
 good text not null default '' check (char_length(good)<=10000),
 learn text not null default '' check (char_length(learn)<=10000),
 tomorrow text not null default '' check (char_length(tomorrow)<=10000),
 published boolean not null default false,
 created_at timestamptz not null default now()
);
create index if not exists journal_entries_room_date on public.journal_entries(owner_id,entry_date desc,created_at desc);
alter table public.journal_entries enable row level security;
revoke all on public.journal_entries from anon,authenticated;
grant select on public.journal_entries to anon,authenticated;
grant insert,update,delete on public.journal_entries to authenticated;

create or replace function public.journal_is_approved(p_user uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.journal_members where user_id=p_user and status='approved') $$;
revoke all on function public.journal_is_approved(uuid) from public;
grant execute on function public.journal_is_approved(uuid) to anon,authenticated;

drop policy if exists "journal public entries" on public.journal_entries;
create policy "journal public entries" on public.journal_entries for select to anon,authenticated
using (published and public.journal_is_approved(owner_id));
drop policy if exists "journal own entries" on public.journal_entries;
create policy "journal own entries" on public.journal_entries for select to authenticated
using (owner_id=auth.uid());
drop policy if exists "journal insert approved" on public.journal_entries;
create policy "journal insert approved" on public.journal_entries for insert to authenticated
with check (owner_id=auth.uid() and public.journal_is_approved(auth.uid()));
drop policy if exists "journal update approved" on public.journal_entries;
create policy "journal update approved" on public.journal_entries for update to authenticated
using (owner_id=auth.uid() and public.journal_is_approved(auth.uid()))
with check (owner_id=auth.uid() and public.journal_is_approved(auth.uid()));
drop policy if exists "journal delete own" on public.journal_entries;
create policy "journal delete own" on public.journal_entries for delete to authenticated using (owner_id=auth.uid());

-- Request membership after authenticating. Never accept an arbitrary user ID or status.
create or replace function public.journal_request(p_name text)
returns void language plpgsql security definer set search_path=''
as $$
begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then
  raise exception 'Email confirmation required';
 end if;
 if p_name is null or char_length(btrim(p_name)) not between 1 and 40 then
  raise exception 'Invalid display name';
 end if;
 insert into public.journal_members(user_id,display_name,email)
 select id,btrim(p_name),coalesce(email,'') from auth.users where id=auth.uid()
 on conflict(user_id) do nothing;
end $$;
revoke all on function public.journal_request(text) from public;
grant execute on function public.journal_request(text) to authenticated;

-- Owner can approve, reject or revoke, but never read someone else's private entries.
create or replace function public.journal_review(p_user uuid,p_status text)
returns void language plpgsql security definer set search_path=''
as $$
begin
 if not public.is_vlog_owner() then raise exception 'Admin required'; end if;
 if p_status is null or p_status not in ('approved','rejected','revoked') then raise exception 'Invalid status'; end if;
 if exists(select 1 from public.vlog_owner where user_id=p_user) then raise exception 'Cannot change administrator status'; end if;
 update public.journal_members set status=p_status where user_id=p_user;
 if not found then raise exception 'Member not found'; end if;
end $$;
revoke all on function public.journal_review(uuid,text) from public;
grant execute on function public.journal_review(uuid,text) to authenticated;

create or replace function public.journal_rename(p_name text)
returns void language plpgsql security definer set search_path=''
as $$
begin
 if auth.uid() is null or p_name is null or char_length(btrim(p_name)) not between 1 and 40 then raise exception 'Invalid name'; end if;
 update public.journal_members set display_name=btrim(p_name) where user_id=auth.uid() and status='approved';
 if not found then raise exception 'Approved member required'; end if;
end $$;
revoke all on function public.journal_rename(text) from public;
grant execute on function public.journal_rename(text) to authenticated;

-- Visitors see room names only when at least one entry is public.
-- No emails or membership requests are returned.
create or replace function public.journal_rooms()
returns table(user_id uuid,display_name text)
language sql stable security definer set search_path=''
as $$
 select m.user_id,m.display_name from public.journal_members m
 where m.status='approved' and (m.user_id=auth.uid() or exists(
 select 1 from public.journal_entries e where e.owner_id=m.user_id and e.published))
 order by m.display_name,m.user_id
$$;
revoke all on function public.journal_rooms() from public;
grant execute on function public.journal_rooms() to anon,authenticated;

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

-- Private household ledger (JPY). No public read policy.
create table if not exists public.budget_records (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 record_date date not null default current_date,
 kind text not null check (kind in ('income','expense')),
 amount_yen integer not null check (amount_yen between 1 and 1000000000),
 category text not null check (char_length(btrim(category)) between 1 and 50),
 note text not null default '' check (char_length(note)<=1000),
 created_at timestamptz not null default now()
);
create index if not exists budget_records_owner_date on public.budget_records(owner_id,record_date desc,created_at desc,id);
alter table public.budget_records enable row level security;
revoke all on public.budget_records from public,anon,authenticated;
grant select,insert,update,delete on public.budget_records to authenticated;
drop policy if exists "budget own read" on public.budget_records;
drop policy if exists "budget own insert" on public.budget_records;
drop policy if exists "budget own update" on public.budget_records;
drop policy if exists "budget own delete" on public.budget_records;
create policy "budget own read" on public.budget_records for select to authenticated using (owner_id=auth.uid());
create policy "budget own insert" on public.budget_records for insert to authenticated with check (owner_id=auth.uid() and public.journal_is_approved(auth.uid()));
create policy "budget own update" on public.budget_records for update to authenticated using (owner_id=auth.uid() and public.journal_is_approved(auth.uid())) with check (owner_id=auth.uid() and public.journal_is_approved(auth.uid()));
create policy "budget own delete" on public.budget_records for delete to authenticated using (owner_id=auth.uid());

-- v15: email-bound, single-use invitations, private planning and financial goals.
create table if not exists public.life_invites (
 id uuid primary key default gen_random_uuid(),
 email text not null check (char_length(email) between 3 and 254),
 code text not null unique default (replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','')),
 expires_at timestamptz not null default now()+interval '7 days',
 used_by uuid references auth.users(id) on delete set null,
 used_at timestamptz,
 revoked boolean not null default false,
 created_at timestamptz not null default now()
);
alter table public.life_invites enable row level security;
revoke all on public.life_invites from public,anon,authenticated;
grant select on public.life_invites to authenticated;
drop policy if exists "invite admin read" on public.life_invites;
create policy "invite admin read" on public.life_invites for select to authenticated using (public.is_vlog_owner());
create or replace function public.life_invite_create(p_email text)
returns text language plpgsql security definer set search_path='' as $$
declare c text;
begin
 if not public.is_vlog_owner() then raise exception 'Admin required'; end if;
 if p_email is null or char_length(btrim(p_email)) not between 3 and 254 or position('@' in p_email)=0 then raise exception 'Invalid email'; end if;
 insert into public.life_invites(email) values(lower(btrim(p_email))) returning code into c;
 return c;
end $$;
create or replace function public.life_invite_revoke(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_vlog_owner() then raise exception 'Admin required'; end if;
 update public.life_invites set revoked=true where id=p_id and used_at is null;
end $$;
create or replace function public.life_invite_request(p_name text,p_code text)
returns void language plpgsql security definer set search_path='' as $$
declare e text; inv uuid;
begin
 if auth.uid() is null then raise exception 'Login required'; end if;
 select lower(email) into e from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if e is null then raise exception 'Confirmed email required'; end if;
 if p_name is null or char_length(btrim(p_name)) not between 1 and 40 then raise exception 'Invalid display name'; end if;
 if exists(select 1 from public.journal_members where user_id=auth.uid()) then raise exception 'Membership already exists'; end if;
 update public.life_invites set used_by=auth.uid(),used_at=now()
 where code=btrim(p_code) and email=e and used_at is null and not revoked and expires_at>now()
 returning id into inv;
 if inv is null then raise exception 'Invalid or expired invitation'; end if;
 insert into public.journal_members(user_id,display_name,email,status) values(auth.uid(),btrim(p_name),e,'pending');
end $$;
revoke all on function public.life_invite_create(text),public.life_invite_revoke(uuid),public.life_invite_request(text,text) from public,anon,authenticated;
grant execute on function public.life_invite_create(text),public.life_invite_revoke(uuid),public.life_invite_request(text,text) to authenticated;
-- Disable the old invitation-free request endpoint (including direct API use).
revoke all on function public.journal_request(text) from public,anon,authenticated;

create table if not exists public.life_items (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('todo','goal','habit','schedule','study','reading','weight','travel','memo','asset','fixed')),
 title text not null check(char_length(btrim(title)) between 1 and 200),
 record_date date not null default current_date,
 value numeric(14,2) check(value>=0),
 target numeric(14,2) check(target>0),
 note text not null default '' check(char_length(note)<=5000),
 done boolean not null default false,
 created_at timestamptz not null default now()
);
create index if not exists life_items_owner_kind_date on public.life_items(owner_id,kind,record_date desc);
alter table public.life_items enable row level security;
revoke all on public.life_items from public,anon,authenticated;
grant select,insert,update,delete on public.life_items to authenticated;
drop policy if exists "life own read" on public.life_items;
drop policy if exists "life own insert" on public.life_items;
drop policy if exists "life own update" on public.life_items;
drop policy if exists "life own delete" on public.life_items;
create policy "life own read" on public.life_items for select to authenticated using(owner_id=auth.uid());
create policy "life own insert" on public.life_items for insert to authenticated with check(owner_id=auth.uid() and public.journal_is_approved(auth.uid()));
create policy "life own update" on public.life_items for update to authenticated using(owner_id=auth.uid() and public.journal_is_approved(auth.uid())) with check(owner_id=auth.uid() and public.journal_is_approved(auth.uid()));
create policy "life own delete" on public.life_items for delete to authenticated using(owner_id=auth.uid());

create table if not exists public.life_habit_checks (
 owner_id uuid not null references auth.users(id) on delete cascade,
 habit_id uuid not null references public.life_items(id) on delete cascade,
 check_date date not null,
 primary key(owner_id,habit_id,check_date)
);
alter table public.life_habit_checks enable row level security;
revoke all on public.life_habit_checks from public,anon,authenticated;
grant select,insert,delete on public.life_habit_checks to authenticated;
drop policy if exists "habit own read" on public.life_habit_checks;
drop policy if exists "habit own insert" on public.life_habit_checks;
drop policy if exists "habit own delete" on public.life_habit_checks;
create policy "habit own read" on public.life_habit_checks for select to authenticated using(owner_id=auth.uid());
create policy "habit own insert" on public.life_habit_checks for insert to authenticated with check(owner_id=auth.uid() and public.journal_is_approved(auth.uid()) and exists(select 1 from public.life_items i where i.id=habit_id and i.owner_id=auth.uid() and i.kind='habit'));
create policy "habit own delete" on public.life_habit_checks for delete to authenticated using(owner_id=auth.uid());

create table if not exists public.life_budget_goals (
 owner_id uuid not null references auth.users(id) on delete cascade,
 month_start date not null check(extract(day from month_start)=1),
 expense_limit bigint not null check(expense_limit between 0 and 100000000000),
 savings_goal bigint not null check(savings_goal between 0 and 100000000000),
 primary key(owner_id,month_start)
);
alter table public.life_budget_goals enable row level security;
revoke all on public.life_budget_goals from public,anon,authenticated;
grant select,insert,update,delete on public.life_budget_goals to authenticated;
drop policy if exists "budget goals own read" on public.life_budget_goals;
drop policy if exists "budget goals own insert" on public.life_budget_goals;
drop policy if exists "budget goals own update" on public.life_budget_goals;
drop policy if exists "budget goals own delete" on public.life_budget_goals;
create policy "budget goals own read" on public.life_budget_goals for select to authenticated using(owner_id=auth.uid());
create policy "budget goals own insert" on public.life_budget_goals for insert to authenticated with check(owner_id=auth.uid() and public.journal_is_approved(auth.uid()));
create policy "budget goals own update" on public.life_budget_goals for update to authenticated using(owner_id=auth.uid() and public.journal_is_approved(auth.uid())) with check(owner_id=auth.uid() and public.journal_is_approved(auth.uid()));
create policy "budget goals own delete" on public.life_budget_goals for delete to authenticated using(owner_id=auth.uid());

-- Dashboard aggregate uses invoker permissions and explicit owner restriction.
create or replace function public.life_dashboard(p_start date,p_end date)
returns jsonb language sql stable security invoker set search_path='' as $$
select jsonb_build_object(
 'income',coalesce((select sum(amount_yen) from public.budget_records where owner_id=auth.uid() and kind='income' and record_date>=p_start and record_date<p_end),0),
 'expense',coalesce((select sum(amount_yen) from public.budget_records where owner_id=auth.uid() and kind='expense' and record_date>=p_start and record_date<p_end),0),
 'training_days',(select count(distinct workout_date) from public.training_records where owner_id=auth.uid() and workout_date>=p_start and workout_date<p_end),
 'journal_days',(select count(distinct entry_date) from public.journal_entries where owner_id=auth.uid() and entry_date>=p_start and entry_date<p_end),
 'study_minutes',coalesce((select sum(value) from public.life_items where owner_id=auth.uid() and kind='study' and record_date>=p_start and record_date<p_end),0)
) $$;
revoke all on function public.life_dashboard(date,date) from public,anon;
grant execute on function public.life_dashboard(date,date) to authenticated;

commit;
select 'MY LIFE v15 setup OK' as result;
