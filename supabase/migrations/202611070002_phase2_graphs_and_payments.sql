-- Apply after 202611070001_phase0_security.sql.
-- Financial writes are reserved for the trusted server. The private security
-- schema must remain absent from the Supabase exposed-schema list.

create function security.valid_graph_rows(p_rows jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  item jsonb;
  value text;
  number double precision;
  ids text[] := array[]::text[];
  blank_seen boolean := false;
  point_count integer := 0;
begin
  if p_rows is null or pg_catalog.jsonb_typeof(p_rows) <> 'array' then
    return false;
  end if;
  if pg_catalog.jsonb_array_length(p_rows) not between 1 and 1000
    or pg_catalog.octet_length(p_rows::text) > 500000 then
    return false;
  end if;
  for item in select * from pg_catalog.jsonb_array_elements(p_rows) loop
    if pg_catalog.jsonb_typeof(item) <> 'object'
      or pg_catalog.jsonb_typeof(item->'id') is distinct from 'string'
      or pg_catalog.jsonb_typeof(item->'x') is distinct from 'string'
      or pg_catalog.jsonb_typeof(item->'y') is distinct from 'string'
      or (item->>'id') !~ '^[A-Za-z0-9-]{1,64}$'
      or (item->>'id') = any(ids)
      or pg_catalog.length(item->>'x') > 80
      or pg_catalog.length(item->>'y') > 80 then
      return false;
    end if;
    ids := pg_catalog.array_append(ids, item->>'id');
    if pg_catalog.btrim(item->>'x') = '' and pg_catalog.btrim(item->>'y') = '' then
      blank_seen := true;
      continue;
    end if;
    if blank_seen then return false; end if;
    foreach value in array array[item->>'x', item->>'y'] loop
      value := pg_catalog.btrim(value);
      if value !~ '^[+-]?([0-9]+([.,][0-9]*)?|[.,][0-9]+)([eE][+-]?[0-9]+)?$' then
        return false;
      end if;
      begin
        number := pg_catalog.replace(value, ',', '.')::double precision;
      exception when numeric_value_out_of_range or invalid_text_representation then
        return false;
      end;
      if number = 0 and pg_catalog.split_part(pg_catalog.lower(value), 'e', 1) ~ '[1-9]' then
        return false;
      end if;
    end loop;
    point_count := point_count + 1;
  end loop;
  return point_count > 0;
end;
$$;
revoke all on function security.valid_graph_rows(jsonb) from public, anon, authenticated;
grant usage on schema security to service_role;
grant execute on function security.valid_graph_rows(jsonb) to service_role;

create table public.graphs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  x_label text not null check (length(btrim(x_label)) between 1 and 160),
  x_unit text not null default '' check (length(x_unit) <= 80),
  y_label text not null check (length(btrim(y_label)) between 1 and 160),
  y_unit text not null default '' check (length(y_unit) <= 80),
  rows jsonb not null check (security.valid_graph_rows(rows)),
  x_boxes integer not null check (x_boxes between 2 and 50),
  y_boxes integer not null check (y_boxes between 2 and 50),
  created_at timestamptz not null default now()
);
create index graphs_user_created_idx on public.graphs(user_id, created_at, id);

create table public.payment_attempts (
  reference text primary key check (reference ~ '^[A-Za-z0-9._=-]{1,100}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  expires_at timestamptz not null,
  plan text not null check (length(plan) between 1 and 100),
  status text not null default 'pending'
    check (status in ('pending', 'initialized', 'success', 'failed', 'abandoned', 'refunded')),
  created_at timestamptz not null default now()
);
create index payment_attempts_user_created_idx on public.payment_attempts(user_id, created_at desc);

create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null,
  starts_at timestamptz not null,
  expires_at timestamptz not null check (expires_at > starts_at),
  paystack_reference text not null unique references public.payment_attempts(reference) on delete cascade,
  amount_paid integer not null check (amount_paid > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index entitlements_user_expiry_idx on public.entitlements(user_id, expires_at);

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  paystack_reference text,
  event_type text not null,
  raw_payload jsonb not null,
  event_hash text not null unique check (event_hash ~ '^[a-f0-9]{64}$'),
  processed_at timestamptz not null default now(),
  outcome text not null default 'received'
);
create index payment_events_reference_idx on public.payment_events(paystack_reference);

-- Unknown references can include late webhooks after account deletion. Retain
-- operational facts only, including for direct service-role failure logging.
create function security.sanitize_unknown_payment_event()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  event_data jsonb;
  safe_amount bigint;
  safe_currency text;
  safe_status text;
begin
  if new.user_id is not null then return new; end if;
  event_data := coalesce(new.raw_payload->'data', new.raw_payload);
  if (event_data->>'amount') ~ '^[0-9]{1,10}$' then
    safe_amount := (event_data->>'amount')::bigint;
  end if;
  if (event_data->>'currency') ~ '^[A-Z]{3}$' then
    safe_currency := event_data->>'currency';
  end if;
  safe_status := case when event_data->>'status' in
    ('success','failed','abandoned','reversed','refunded','pending','processed','processing','ongoing','queued')
    then event_data->>'status' else 'unknown' end;
  if new.paystack_reference is not null and new.paystack_reference !~ '^[A-Za-z0-9._=-]{1,100}$' then
    new.paystack_reference := null;
  end if;
  new.raw_payload := pg_catalog.jsonb_build_object(
    'event', new.event_type, 'reference', new.paystack_reference,
    'status', safe_status, 'amount', safe_amount, 'currency', safe_currency
  );
  return new;
end;
$$;
revoke all on function security.sanitize_unknown_payment_event() from public, anon, authenticated;
create trigger sanitize_unknown_payment_events
before insert or update of user_id, raw_payload, paystack_reference on public.payment_events
for each row execute function security.sanitize_unknown_payment_event();

alter table public.graphs enable row level security;
alter table public.payment_attempts enable row level security;
alter table public.entitlements enable row level security;
alter table public.payment_events enable row level security;

revoke all on table public.graphs, public.payment_attempts, public.entitlements, public.payment_events
  from public, anon, authenticated;
grant select, delete on table public.graphs to authenticated;
grant select on table public.payment_attempts, public.entitlements to authenticated;
grant all on table public.graphs, public.payment_attempts, public.entitlements, public.payment_events to service_role;

create function public.has_semester_pass()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.current_session_is_active() and exists (
    select 1 from public.entitlements as entitlement
    where entitlement.user_id = auth.uid()
      and entitlement.starts_at <= pg_catalog.now()
      and entitlement.expires_at > pg_catalog.now()
      and entitlement.revoked_at is null
  );
$$;
revoke all on function public.has_semester_pass() from public, anon;
grant execute on function public.has_semester_pass() to authenticated;

-- Definer helpers derive their own user ID; no caller-supplied identity. This
-- avoids recursive RLS when the policy needs the user's oldest graph.
create function public.first_graph_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select graph.id from public.graphs as graph
  where graph.user_id = auth.uid() and public.current_session_is_active()
  order by graph.created_at, graph.id limit 1;
$$;
revoke all on function public.first_graph_id() from public, anon;
grant execute on function public.first_graph_id() to authenticated;

create policy graphs_read_own_accessible on public.graphs for select to authenticated
  using (user_id = auth.uid() and public.current_session_is_active()
    and (public.has_semester_pass() or id = public.first_graph_id()));
create policy graphs_delete_own on public.graphs for delete to authenticated
  using (user_id = auth.uid() and public.current_session_is_active());
create policy entitlements_read_own on public.entitlements for select to authenticated
  using (user_id = auth.uid() and public.current_session_is_active());
create policy attempts_read_own on public.payment_attempts for select to authenticated
  using (user_id = auth.uid() and public.current_session_is_active());

create function public.save_graph(
  p_id uuid, p_title text, p_x_label text, p_x_unit text,
  p_y_label text, p_y_unit text, p_rows jsonb,
  p_x_boxes integer, p_y_boxes integer
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_owner uuid;
  v_exists boolean;
begin
  if v_user is null or not public.current_session_is_active() then
    raise exception 'Your session has ended. Log in again.' using errcode = '42501';
  end if;
  if p_id is null or p_title is null or length(btrim(p_title)) not between 1 and 200
    or p_x_label is null or length(btrim(p_x_label)) not between 1 and 160
    or p_y_label is null or length(btrim(p_y_label)) not between 1 and 160
    or p_x_unit is null or length(p_x_unit) > 80
    or p_y_unit is null or length(p_y_unit) > 80
    or p_x_boxes is null or p_x_boxes not between 2 and 50
    or p_y_boxes is null or p_y_boxes not between 2 and 50
    or not security.valid_graph_rows(p_rows) then
    raise exception 'Check the graph title, labels, boxes and data rows.' using errcode = '22023';
  end if;

  -- Serializes concurrent saves for the same owner, including first saves.
  -- A table count checked only in application code would be raceable.
  perform 1 from auth.users where id = v_user for update;
  if not found or not public.current_session_is_active() then
    raise exception 'Your session has ended. Log in again.' using errcode = '42501';
  end if;
  select user_id into v_owner from public.graphs where id = p_id;
  v_exists := found;
  if v_exists and v_owner <> v_user then
    raise exception 'This graph is not available.' using errcode = '42501';
  end if;
  if not public.has_semester_pass() then
    if (not v_exists and exists (select 1 from public.graphs where user_id = v_user))
      or (v_exists and p_id is distinct from public.first_graph_id()) then
      raise exception 'The free plan includes one saved graph. Upgrade for more.' using errcode = 'P0001';
    end if;
  end if;
  -- Direct authenticated RPC calls must not bypass the save write quota.
  -- Rejected transactions roll back; the server separately limits all attempts.
  if not public.consume_rate_limit(
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to('graph-write:' || v_user::text, 'UTF8')), 'hex'),
    60, 900
  ) then
    raise exception 'Too many saves. Wait before trying again.' using errcode = '54000';
  end if;
  insert into public.graphs (id, user_id, title, x_label, x_unit, y_label, y_unit, rows, x_boxes, y_boxes)
  values (p_id, v_user, btrim(p_title), btrim(p_x_label), btrim(p_x_unit), btrim(p_y_label), btrim(p_y_unit), p_rows, p_x_boxes, p_y_boxes)
  on conflict (id) do update set
    title = excluded.title, x_label = excluded.x_label, x_unit = excluded.x_unit,
    y_label = excluded.y_label, y_unit = excluded.y_unit, rows = excluded.rows,
    x_boxes = excluded.x_boxes, y_boxes = excluded.y_boxes
  where public.graphs.user_id = v_user;
  if not found then
    raise exception 'This graph is not available.' using errcode = '42501';
  end if;
  return p_id;
end;
$$;
revoke all on function public.save_graph(uuid,text,text,text,text,text,jsonb,integer,integer) from public, anon;
grant execute on function public.save_graph(uuid,text,text,text,text,text,jsonb,integer,integer) to authenticated;

-- The HTTP webhook handler must authenticate the raw body and call Paystack's
-- verify endpoint BEFORE calling this service-only function. The browser has no
-- grant path. A reference can create one entitlement, never extend it twice.
create function public.apply_payment_event(
  p_reference text, p_event_type text, p_payload jsonb,
  p_event_hash text, p_verified jsonb
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  attempt public.payment_attempts%rowtype;
  v_event uuid;
  v_matches boolean := false;
  v_outcome text := 'ignored_event';
begin
  if p_event_type is null or p_event_type !~ '^[a-z][a-z0-9_.-]{0,119}$'
    or p_event_hash is null or p_event_hash !~ '^[a-f0-9]{64}$'
    or p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object'
    or pg_catalog.octet_length(p_payload::text) > 500000
    or (p_reference is not null and length(p_reference) > 200) then
    raise exception 'Invalid payment event.' using errcode = '22023';
  end if;
  select * into attempt from public.payment_attempts where reference = p_reference for update;
  insert into public.payment_events(user_id, paystack_reference, event_type, raw_payload, event_hash)
  values (attempt.user_id, p_reference, p_event_type, p_payload, p_event_hash)
  on conflict (event_hash) do nothing returning id into v_event;
  if v_event is null then return false; end if;
  if attempt.reference is null then
    update public.payment_events set outcome = 'unknown_reference' where id = v_event;
    return true;
  end if;

  v_matches := coalesce(
    pg_catalog.jsonb_typeof(p_verified) = 'object'
    and p_verified->>'reference' = attempt.reference
    and p_verified->>'domain' = 'test'
    and p_verified->>'currency' = attempt.currency
    and case when (p_verified->>'amount') ~ '^[0-9]{1,10}$'
      then (p_verified->>'amount')::bigint = attempt.amount else false end,
    false
  );

  if p_event_type = 'charge.success' then
    if not v_matches or p_verified->>'status' is distinct from 'success' then
      v_outcome := 'verification_mismatch';
    elsif attempt.status = 'refunded' then
      v_outcome := 'already_refunded';
    elsif attempt.expires_at <= pg_catalog.now() then
      v_outcome := 'semester_expired';
    else
      insert into public.entitlements(user_id, plan, starts_at, expires_at, paystack_reference, amount_paid, currency)
      values (attempt.user_id, attempt.plan, pg_catalog.now(), attempt.expires_at, attempt.reference, attempt.amount, attempt.currency)
      on conflict (paystack_reference) do nothing;
      update public.payment_attempts set status = 'success' where reference = attempt.reference;
      v_outcome := 'payment_verified';
    end if;
  elsif p_event_type = 'refund.processed' then
    -- An authenticated partial refund can leave the transaction's verify status
    -- as success. Conservatively revoke the pass for any processed refund, but
    -- bind its signed payload to this original amount/currency/reference.
    if not v_matches
      or coalesce(p_verified->>'status', '') not in ('success', 'reversed', 'refunded')
      or coalesce(p_payload->'data'->>'status', '') <> 'processed'
      or coalesce(p_payload->'data'->>'currency', '') <> attempt.currency
      or coalesce(p_payload->'data'->>'transaction_reference', p_payload->'data'->'transaction'->>'reference', '') <> attempt.reference
      or not (case when (p_payload->'data'->>'amount') ~ '^[0-9]{1,10}$'
        then (p_payload->'data'->>'amount')::bigint between 1 and attempt.amount
        else false end) then
      v_outcome := 'verification_mismatch';
    else
      update public.entitlements set revoked_at = coalesce(revoked_at, pg_catalog.now())
      where paystack_reference = attempt.reference;
      update public.payment_attempts set status = 'refunded' where reference = attempt.reference;
      v_outcome := 'refund_verified';
    end if;
  elsif p_event_type in ('charge.failed', 'charge.abandoned') then
    if v_matches and p_verified->>'status' in ('failed', 'abandoned') then
      update public.payment_attempts
        set status = case when p_verified->>'status' = 'failed' then 'failed' else 'abandoned' end
      where reference = attempt.reference and status not in ('success', 'refunded');
      v_outcome := 'payment_not_completed';
    else
      v_outcome := 'verification_mismatch';
    end if;
  end if;
  update public.payment_events set outcome = v_outcome where id = v_event;
  return true;
end;
$$;
revoke all on function public.apply_payment_event(text,text,jsonb,text,jsonb) from public, anon, authenticated;
grant execute on function public.apply_payment_event(text,text,jsonb,text,jsonb) to service_role;

comment on table public.payment_attempts is 'Server-created checkout snapshots. Browser amount, currency, expiry and owner claims are never authoritative.';
comment on table public.payment_events is 'Signed payment event audit. Known-user records cascade on account deletion; raw payload is never exposed to clients.';
comment on function public.save_graph(uuid,text,text,text,text,text,jsonb,integer,integer) is 'Atomic per-user free/paid graph limit, authenticated identity and last-save-wins updates.';
