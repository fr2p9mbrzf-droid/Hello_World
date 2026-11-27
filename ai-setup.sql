begin;
create table if not exists public.life_ai_usage (
 day date not null,
 scope text not null,
 calls integer not null default 0 check(calls>=0),
 primary key(day,scope)
);
alter table public.life_ai_usage enable row level security;
revoke all on public.life_ai_usage from public,anon,authenticated;
create or replace function public.life_ai_reserve()
returns void language plpgsql security definer set search_path='' as $$
declare d date := (now() at time zone 'Asia/Tokyo')::date; n integer;
begin
 if auth.uid() is null or not public.journal_is_approved(auth.uid()) then raise exception 'Approved member required'; end if;
 insert into public.life_ai_usage(day,scope,calls) values(d,'all',1)
 on conflict(day,scope) do update set calls=public.life_ai_usage.calls+1
 where public.life_ai_usage.calls<100 returning calls into n;
 if not found then raise exception 'Daily app limit reached'; end if;
 insert into public.life_ai_usage(day,scope,calls) values(d,auth.uid()::text,1)
 on conflict(day,scope) do update set calls=public.life_ai_usage.calls+1
 where public.life_ai_usage.calls<20 returning calls into n;
 if not found then raise exception 'Daily member limit reached'; end if;
end $$;
revoke all on function public.life_ai_reserve() from public,anon,authenticated;
grant execute on function public.life_ai_reserve() to authenticated;
commit;
select 'MY LIFE AI quota OK' as result;
