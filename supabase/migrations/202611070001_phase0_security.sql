-- Phase 0 only: no graph, entitlement, or payment tables yet.
-- The private schema must not be added to the exposed API schemas.
create schema if not exists security;
revoke all on schema security from public, anon, authenticated;

create table security.rate_limit_buckets (
  key text primary key check (key ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null,
  expires_at timestamptz not null,
  attempts integer not null check (attempts > 0)
);
alter table security.rate_limit_buckets enable row level security;
revoke all on table security.rate_limit_buckets from public, anon, authenticated;
create index rate_limit_buckets_expiry_idx on security.rate_limit_buckets (expires_at);

-- Only the trusted server can consume a bucket. No policy grants client access.
-- The statement's UPSERT locks the bucket so concurrent requests cannot all pass.
create function public.consume_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_start timestamptz;
  v_attempts integer;
begin
  if p_key is null or p_key !~ '^[a-f0-9]{64}$'
    or p_limit is null or p_limit < 1 or p_limit > 10000
    or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Invalid rate limit configuration' using errcode = '22023';
  end if;

  v_start := pg_catalog.to_timestamp(
    pg_catalog.floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );

  insert into security.rate_limit_buckets as bucket
    (key, window_started_at, expires_at, attempts)
  values (p_key, v_start, v_start + pg_catalog.make_interval(secs => p_window_seconds), 1)
  on conflict (key) do update set
    window_started_at = greatest(bucket.window_started_at, excluded.window_started_at),
    expires_at = greatest(bucket.expires_at, excluded.expires_at),
    attempts = case
      when bucket.window_started_at >= excluded.window_started_at
        then least(bucket.attempts + 1, 10001)
      else 1
    end
  returning attempts into v_attempts;

  -- Bounded opportunistic cleanup; no per-request unbounded table scans/deletes.
  delete from security.rate_limit_buckets
  where key in (
    select stale.key from security.rate_limit_buckets as stale
    where stale.expires_at < v_now - interval '1 day'
    order by stale.expires_at limit 50
    for update skip locked
  );

  return v_attempts <= p_limit;
end;
$$;
revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

-- Check the provider's authoritative session, not a browser-editable cookie age.
-- This enforces expiry on the free Supabase plan and invalidates app access after
-- logout/account deletion even while a previously issued JWT is unexpired.
create function public.current_session_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.sessions as session
    join auth.users as account on account.id = session.user_id
    where session.user_id = auth.uid()
      and session.id::text = (auth.jwt() ->> 'session_id')
      and session.created_at > pg_catalog.now() - interval '12 hours'
      and (session.not_after is null or session.not_after > pg_catalog.now())
      and account.email_confirmed_at is not null
      and (account.banned_until is null or account.banned_until < pg_catalog.now())
  );
$$;
revoke all on function public.current_session_is_active() from public, anon;
grant execute on function public.current_session_is_active() to authenticated;

comment on function public.current_session_is_active() is
  'Verified session + confirmed email + 12-hour absolute expiry. Use on every protected server operation and in future RLS policies.';
comment on table security.rate_limit_buckets is
  'Internal abuse protection only; HMAC/SHA-256 keys, no raw email addresses or IP addresses. No browser access.';
