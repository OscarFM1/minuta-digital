-- scripts/01_my_minutes_stats.sql
create index if not exists idx_minute_user_date on public.minute(user_id, date);
create index if not exists idx_minute_user on public.minute(user_id);

create or replace function public.my_minutes_stats(
  p_from date default null,
  p_to   date default null
)
returns table(
  total bigint,
  total_seconds bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    total := 0; total_seconds := 0; return next; return;
  end if;

  return query
  select
    count(*)::bigint,
    coalesce(sum(duration_seconds), 0)::bigint
  from public.minute m
  where m.user_id = v_uid
    and (p_from is null or m.date >= p_from)
    and (p_to   is null or m.date <= p_to);
end;
$$;

revoke all on function public.my_minutes_stats(date, date) from public;
grant execute on function public.my_minutes_stats(date, date) to authenticated;
