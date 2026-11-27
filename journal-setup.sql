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
commit;

select 'journal setup OK' as result,
 (select count(*) from public.journal_members where status='approved') as approved_members,
 (select count(*) from public.journal_entries) as journal_entries;
