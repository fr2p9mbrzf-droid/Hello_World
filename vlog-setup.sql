-- MY LIFE: run once in a new Supabase project's SQL Editor.
-- First create your own user in Authentication > Users, then replace
-- 00000000-0000-0000-0000-000000000000 below with that user's UUID.
begin;
create table if not exists public.vlog_owner (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.vlog_owner enable row level security;
revoke all on public.vlog_owner from anon, authenticated;
insert into public.vlog_owner(user_id) values ('00000000-0000-0000-0000-000000000000') on conflict do nothing;
create or replace function public.is_vlog_owner() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.vlog_owner where user_id = auth.uid()) $$;
revoke all on function public.is_vlog_owner() from public;
grant execute on function public.is_vlog_owner() to authenticated;
create table if not exists public.vlog_videos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  path text unique not null,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 5000),
  published boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.vlog_videos enable row level security;
grant select on public.vlog_videos to anon, authenticated;
grant insert, update, delete on public.vlog_videos to authenticated;
create policy "vlog public read" on public.vlog_videos for select to anon, authenticated using (published);
create policy "vlog owner read" on public.vlog_videos for select to authenticated using (public.is_vlog_owner() and owner_id = auth.uid());
create policy "vlog owner insert" on public.vlog_videos for insert to authenticated with check (public.is_vlog_owner() and owner_id = auth.uid() and split_part(path,'/',1) = auth.uid()::text);
create policy "vlog owner update" on public.vlog_videos for update to authenticated using (public.is_vlog_owner() and owner_id = auth.uid()) with check (public.is_vlog_owner() and owner_id = auth.uid() and split_part(path,'/',1) = auth.uid()::text);
create policy "vlog owner delete" on public.vlog_videos for delete to authenticated using (public.is_vlog_owner() and owner_id = auth.uid());
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('vlog-videos','vlog-videos',false,50000000,array['video/mp4','video/webm','video/quicktime']) on conflict (id) do nothing;
create policy "vlog storage public read" on storage.objects for select to anon, authenticated using (bucket_id = 'vlog-videos' and exists (select 1 from public.vlog_videos v where v.path = storage.objects.name and v.published));
create policy "vlog storage owner read" on storage.objects for select to authenticated using (bucket_id = 'vlog-videos' and public.is_vlog_owner() and (storage.foldername(name))[1] = auth.uid()::text);
create policy "vlog storage owner insert" on storage.objects for insert to authenticated with check (bucket_id = 'vlog-videos' and public.is_vlog_owner() and (storage.foldername(name))[1] = auth.uid()::text);
create policy "vlog storage owner delete" on storage.objects for delete to authenticated using (bucket_id = 'vlog-videos' and public.is_vlog_owner() and (storage.foldername(name))[1] = auth.uid()::text);
commit;
