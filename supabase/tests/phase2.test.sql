begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select ok((select bool_and(relrowsecurity) from pg_class where oid in (
  'public.graphs'::regclass, 'public.entitlements'::regclass,
  'public.payment_attempts'::regclass, 'public.payment_events'::regclass
)), 'RLS enabled on every Phase 2 table');
select ok(not has_table_privilege('authenticated', 'public.graphs', 'INSERT'), 'direct graph insert cannot bypass free limit');
select ok(not has_table_privilege('authenticated', 'public.graphs', 'UPDATE'), 'direct graph update cannot bypass entitlements');
select ok(not has_table_privilege('authenticated', 'public.entitlements', 'INSERT'), 'users cannot grant themselves passes');
select ok(not has_table_privilege('authenticated', 'public.payment_attempts', 'UPDATE'), 'users cannot change checkout snapshots');
select ok(not has_table_privilege('authenticated', 'public.payment_events', 'SELECT'), 'raw webhook payload is not client-readable');
select ok(not has_function_privilege('authenticated', 'public.apply_payment_event(text,text,jsonb,text,jsonb)', 'EXECUTE'), 'users cannot process payment events');
select ok(has_function_privilege('service_role', 'public.apply_payment_event(text,text,jsonb,text,jsonb)', 'EXECUTE'), 'only trusted server can process webhooks');
select ok(not has_function_privilege('anon', 'public.save_graph(uuid,text,text,text,text,text,jsonb,integer,integer)', 'EXECUTE'), 'anonymous save is denied');

insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values
  ('30000000-0000-4000-8000-000000000001','phase2-a@example.invalid',now(),now(),now()),
  ('30000000-0000-4000-8000-000000000002','phase2-b@example.invalid',now(),now(),now());
insert into auth.sessions(id,user_id,created_at,updated_at) values
  ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',now(),now()),
  ('40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002',now(),now());
set local request.jwt.claim.sub = '30000000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"40000000-0000-4000-8000-000000000001"}';

select is(public.has_semester_pass(), false, 'new account has no paid access');
select is(public.save_graph('50000000-0000-4000-8000-000000000001','First','Time','s','Distance','m',
  '[{"id":"row-1","x":"1,5","y":"2.5"}]',10,10),
  '50000000-0000-4000-8000-000000000001'::uuid, 'free user can save one graph');
select is(public.save_graph('50000000-0000-4000-8000-000000000001','Updated','Time','s','Distance','m',
  '[{"id":"row-1","x":"2","y":"4"}]',12,15),
  '50000000-0000-4000-8000-000000000001'::uuid, 'retry with same graph id updates instead of duplicating');
select is((select title from public.graphs where id='50000000-0000-4000-8000-000000000001'), 'Updated', 'last graph save wins');
update security.rate_limit_buckets set attempts=60
where key=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to('graph-write:30000000-0000-4000-8000-000000000001','UTF8')),'hex');
select throws_ok($q$select public.save_graph('50000000-0000-4000-8000-000000000001','Throttled','Time','s','Distance','m',
  '[{"id":"row-1","x":"1","y":"2"}]',10,10)$q$, '54000',
  'Too many saves. Wait before trying again.', 'direct RPC cannot bypass the write quota');
delete from security.rate_limit_buckets
where key=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to('graph-write:30000000-0000-4000-8000-000000000001','UTF8')),'hex');
select throws_ok($q$select public.save_graph('50000000-0000-4000-8000-000000000002','Second','Time','s','Distance','m',
  '[{"id":"row-1","x":"1","y":"2"}]',10,10)$q$, 'P0001',
  'The free plan includes one saved graph. Upgrade for more.', 'second free graph is rejected in database');
select throws_ok($q$select public.save_graph('50000000-0000-4000-8000-000000000001','Updated','Time','s','Distance','m',
  '[{"id":"row-1","x":"not a number","y":"2"}]',10,10)$q$, '22023',
  'Check the graph title, labels, boxes and data rows.', 'invalid graph numbers rejected by RPC');
select throws_ok($q$select public.save_graph('50000000-0000-4000-8000-000000000001','Updated','Time','s','Distance','m',
  '[{"id":"row-1","x":"1e9999","y":"2"}]',10,10)$q$, '22023',
  'Check the graph title, labels, boxes and data rows.', 'overflowed graph numbers rejected');
select is(security.valid_graph_rows('[{"id":"row-1","x":"1","y":"2"},{"id":"row-2","x":"","y":""}]'), true, 'empty trailing rows are permitted');
select is(security.valid_graph_rows('[{"id":"row-1","x":"","y":""},{"id":"row-2","x":"1","y":"2"}]'), false, 'internal blank rows rejected');
select is(security.valid_graph_rows('[{"id":"same","x":"1","y":"2"},{"id":"same","x":"2","y":"3"}]'), false, 'duplicate data row IDs rejected');
select is(security.valid_graph_rows('{}'), false, 'non-array rows rejected safely');
select is(security.valid_graph_rows('[]'), false, 'empty data rejected');

-- Privileged snapshot creation happens before redirecting to hosted checkout.
insert into public.payment_attempts(reference,user_id,amount,currency,expires_at,plan) values
  ('phase2-success','30000000-0000-4000-8000-000000000001',5000,'GHS',now()+interval '30 days','semester'),
  ('phase2-refund-first','30000000-0000-4000-8000-000000000002',5000,'GHS',now()+interval '30 days','semester'),
  ('phase2-bad-amount','30000000-0000-4000-8000-000000000002',5000,'GHS',now()+interval '30 days','semester'),
  ('phase2-failed','30000000-0000-4000-8000-000000000002',5000,'GHS',now()+interval '30 days','semester');

select is(public.apply_payment_event('phase2-success','charge.success','{"event":"charge.success"}',repeat('a',64),
  '{"reference":"phase2-success","status":"success","domain":"test","amount":5000,"currency":"GHS"}'), true, 'verified webhook is processed');
select is(public.has_semester_pass(), true, 'verified payment unlocks paid access');
select is((select count(*) from public.entitlements where paystack_reference='phase2-success'), 1::bigint, 'exactly one entitlement created');
select is(public.apply_payment_event('phase2-success','charge.success','{"event":"charge.success"}',repeat('a',64),
  '{"reference":"phase2-success","status":"success","domain":"test","amount":5000,"currency":"GHS"}'), false, 'identical webhook delivery is idempotent');
select is(public.apply_payment_event('phase2-success','charge.success','{"event":"charge.success","retry":true}',repeat('b',64),
  '{"reference":"phase2-success","status":"success","domain":"test","amount":5000,"currency":"GHS"}'), true, 'distinct repeat event logged');
select is((select count(*) from public.entitlements where paystack_reference='phase2-success'), 1::bigint, 'reference uniqueness prevents duplicate entitlement');
select is((select expires_at from public.entitlements where paystack_reference='phase2-success'),
  (select expires_at from public.payment_attempts where reference='phase2-success'), 'repeat webhook cannot extend expiry snapshot');

select is(public.save_graph('50000000-0000-4000-8000-000000000002','Paid graph','Time','s','Distance','m',
  '[{"id":"row-1","x":"1","y":"2"}]',10,10),
  '50000000-0000-4000-8000-000000000002'::uuid, 'paid user can save another graph');

set local role authenticated;
select is((select count(*) from public.graphs), 2::bigint, 'paid user reads their own graphs');
reset role;

set local request.jwt.claim.sub = '30000000-0000-4000-8000-000000000002';
set local request.jwt.claims = '{"sub":"30000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"40000000-0000-4000-8000-000000000002"}';
set local role authenticated;
select is((select count(*) from public.graphs), 0::bigint, 'another user cannot read saved graphs');
select is((select count(*) from public.entitlements), 0::bigint, 'another user cannot read entitlements');
reset role;
select throws_ok($q$select public.save_graph('50000000-0000-4000-8000-000000000001','Stolen','Time','s','Distance','m',
  '[{"id":"row-1","x":"1","y":"2"}]',10,10)$q$, '42501',
  'This graph is not available.', 'graph ID cannot overwrite another owner');

select is(public.apply_payment_event('phase2-bad-amount','charge.success','{"event":"charge.success"}',repeat('c',64),
  '{"reference":"phase2-bad-amount","status":"success","domain":"test","amount":1,"currency":"GHS"}'), true, 'wrong amount event logged');
select is((select count(*) from public.entitlements where paystack_reference='phase2-bad-amount'), 0::bigint, 'wrong amount grants nothing');
select is((select outcome from public.payment_events where event_hash=repeat('c',64)), 'verification_mismatch', 'wrong amount audit explains rejection');
select is(public.apply_payment_event('phase2-bad-amount','charge.success','{"event":"charge.success"}',repeat('3',64),
  '{"reference":"phase2-bad-amount","status":"success","domain":"test","amount":5000,"currency":"NGN"}'), true, 'wrong currency event logged');
select is(public.apply_payment_event('phase2-bad-amount','charge.success','{"event":"charge.success"}',repeat('4',64),
  '{"reference":"phase2-bad-amount","status":"success","domain":"live","amount":5000,"currency":"GHS"}'), true, 'live domain event logged but never accepted');
select is(public.apply_payment_event('phase2-bad-amount','charge.success','{"event":"charge.success"}',repeat('5',64),
  '{"reference":"another-reference","status":"success","domain":"test","amount":5000,"currency":"GHS"}'), true, 'wrong verification reference logged');
select is((select count(*) from public.entitlements where paystack_reference='phase2-bad-amount'), 0::bigint, 'currency/domain/reference mismatches grant nothing');
select is(public.apply_payment_event('unknown-reference','charge.success',
  '{"event":"charge.success","data":{"status":"success","amount":5000,"currency":"GHS","customer":{"email":"private@example.invalid"},"authorization":{"last4":"1234"}}}',repeat('6',64),
  '{"reference":"unknown-reference","status":"success","domain":"test","amount":5000,"currency":"GHS"}'), true, 'unknown reference is logged');
select ok(not exists (select 1 from public.payment_events where event_hash=repeat('6',64) and raw_payload::text like '%private@example.invalid%'), 'unknown-user payload does not retain customer email');
select ok(not exists (select 1 from public.payment_events where event_hash=repeat('6',64) and raw_payload::text like '%1234%'), 'unknown-user payload does not retain card data');
select is(public.apply_payment_event('phase2-bad-amount','charge.success','{"event":"charge.success","bad":true}',repeat('d',64),
  '{"reference":"phase2-bad-amount","status":"success","domain":"test","amount":"bad","currency":"GHS"}'), true, 'malformed verify amount logs without rollback');

select is(public.apply_payment_event('phase2-refund-first','refund.processed','{"event":"refund.processed","data":{"status":"processed","transaction_reference":"phase2-refund-first","amount":5000,"currency":"GHS"}}',repeat('e',64),
  '{"reference":"phase2-refund-first","status":"reversed","domain":"test","amount":5000,"currency":"GHS"}'), true, 'refund can be processed before charge event delivery');
select is(public.apply_payment_event('phase2-refund-first','charge.success','{"event":"charge.success"}',repeat('f',64),
  '{"reference":"phase2-refund-first","status":"success","domain":"test","amount":5000,"currency":"GHS"}'), true, 'late charge event after refund logged');
select is((select count(*) from public.entitlements where paystack_reference='phase2-refund-first'), 0::bigint, 'out-of-order charge cannot restore refunded access');
select is((select status from public.payment_attempts where reference='phase2-refund-first'), 'refunded', 'refund is terminal');
select is(public.apply_payment_event('phase2-failed','charge.failed','{"event":"charge.failed"}',repeat('1',64),
  '{"reference":"phase2-failed","status":"failed","domain":"test","amount":5000,"currency":"GHS"}'), true, 'failed payment logged');
select is((select count(*) from public.entitlements where paystack_reference='phase2-failed'), 0::bigint, 'failed payment does not unlock');
select is(public.apply_payment_event('phase2-success','charge.failed','{"event":"charge.failed"}',repeat('7',64),
  '{"reference":"phase2-success","status":"failed","domain":"test","amount":5000,"currency":"GHS"}'), true, 'late failed event is logged');
select is((select status from public.payment_attempts where reference='phase2-success'), 'success', 'late failure cannot downgrade verified success');

set local request.jwt.claim.sub = '30000000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"40000000-0000-4000-8000-000000000001"}';
select is(public.apply_payment_event('phase2-success','refund.processed','{"event":"refund.processed","data":{"status":"processed","transaction_reference":"phase2-success","amount":100,"currency":"GHS"}}',repeat('2',64),
  '{"reference":"phase2-success","status":"success","domain":"test","amount":5000,"currency":"GHS"}'), true, 'verified partial refund revokes entitlement even while original status is success');
select is(public.has_semester_pass(), false, 'refund closes paid access');
set local role authenticated;
select is((select count(*) from public.graphs), 1::bigint, 'free access after refund retains only the first graph');
reset role;
select throws_ok($q$select public.save_graph('50000000-0000-4000-8000-000000000002','Locked paid graph','Time','s','Distance','m',
  '[{"id":"row-1","x":"1","y":"2"}]',10,10)$q$, 'P0001',
  'The free plan includes one saved graph. Upgrade for more.', 'refunded account cannot update additional paid graph');

update auth.sessions set created_at=now()-interval '13 hours' where id='40000000-0000-4000-8000-000000000001';
set local role authenticated;
select is((select count(*) from public.graphs), 0::bigint, 'expired session cannot read graphs');
reset role;
select throws_ok($q$select public.save_graph('50000000-0000-4000-8000-000000000001','Expired','Time','s','Distance','m',
  '[{"id":"row-1","x":"1","y":"2"}]',10,10)$q$, '42501',
  'Your session has ended. Log in again.', 'expired session cannot save');

delete from auth.users where id='30000000-0000-4000-8000-000000000001';
select is((select count(*) from public.graphs where user_id='30000000-0000-4000-8000-000000000001'), 0::bigint, 'account deletion cascades saved graphs');
select is((select count(*) from public.entitlements where user_id='30000000-0000-4000-8000-000000000001'), 0::bigint, 'account deletion cascades entitlements');
select is((select count(*) from public.payment_attempts where user_id='30000000-0000-4000-8000-000000000001'), 0::bigint, 'account deletion cascades payment snapshots');
select is((select count(*) from public.payment_events where user_id='30000000-0000-4000-8000-000000000001'), 0::bigint, 'account deletion cascades known-user raw event data');

select * from finish();
rollback;
