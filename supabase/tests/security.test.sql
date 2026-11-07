begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(20);

select ok((select relrowsecurity from pg_class where oid = 'security.rate_limit_buckets'::regclass),
  'rate limit table has RLS');
select ok(not has_schema_privilege('anon', 'security', 'USAGE'), 'anon cannot use private schema');
select ok(not has_table_privilege('authenticated', 'security.rate_limit_buckets', 'SELECT'),
  'authenticated cannot read rate limit data');
select ok(not has_function_privilege('anon', 'public.consume_rate_limit(text,integer,integer)', 'EXECUTE'),
  'anon cannot consume/reset rate limits');
select ok(not has_function_privilege('authenticated', 'public.consume_rate_limit(text,integer,integer)', 'EXECUTE'),
  'authenticated cannot consume/reset rate limits');
select ok(has_function_privilege('service_role', 'public.consume_rate_limit(text,integer,integer)', 'EXECUTE'),
  'service role can consume rate limits');
select ok(not has_function_privilege('anon', 'public.current_session_is_active()', 'EXECUTE'),
  'anon cannot check sessions');
select ok(has_function_privilege('authenticated', 'public.current_session_is_active()', 'EXECUTE'),
  'authenticated can check their session');
select is(public.current_session_is_active(), false, 'missing identity does not have active session');

delete from security.rate_limit_buckets where key = repeat('a', 64);
select is(public.consume_rate_limit(repeat('a', 64), 2, 3600), true, 'first request accepted');
select is(public.consume_rate_limit(repeat('a', 64), 2, 3600), true, 'second request accepted');
select is(public.consume_rate_limit(repeat('a', 64), 2, 3600), false, 'third request rejected');

-- Disposable provider records, rolled back at the end. No passwords needed.
insert into auth.users (id, email, email_confirmed_at, created_at, updated_at)
values ('10000000-0000-4000-8000-000000000001', 'phase0-test@example.invalid', now(), now(), now());
insert into auth.sessions (id, user_id, created_at, updated_at)
values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', now(), now());
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"20000000-0000-4000-8000-000000000001"}';
select is(public.current_session_is_active(), true, 'confirmed user with fresh session is active');

update auth.users set email_confirmed_at = null where id = '10000000-0000-4000-8000-000000000001';
select is(public.current_session_is_active(), false, 'unconfirmed email is blocked');
update auth.users set email_confirmed_at = now(), banned_until = now() + interval '1 hour'
where id = '10000000-0000-4000-8000-000000000001';
select is(public.current_session_is_active(), false, 'banned account is blocked');
update auth.users set banned_until = null where id = '10000000-0000-4000-8000-000000000001';

update auth.sessions set created_at = now() - interval '12 hours'
where id = '20000000-0000-4000-8000-000000000001';
select is(public.current_session_is_active(), false, '12-hour absolute expiry is enforced');
update auth.sessions set created_at = now(), not_after = now() - interval '1 minute'
where id = '20000000-0000-4000-8000-000000000001';
select is(public.current_session_is_active(), false, 'provider expiry is enforced');
update auth.sessions set not_after = null where id = '20000000-0000-4000-8000-000000000001';

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"20000000-0000-4000-8000-000000000001"}';
select is(public.current_session_is_active(), false, 'session cannot be used by a different user');
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"20000000-0000-4000-8000-000000000001"}';

delete from auth.sessions where id = '20000000-0000-4000-8000-000000000001';
select is(public.current_session_is_active(), false, 'revoked session is blocked despite unexpired JWT claims');
insert into auth.sessions (id, user_id, created_at, updated_at)
values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', now(), now());
delete from auth.users where id = '10000000-0000-4000-8000-000000000001';
select is(public.current_session_is_active(), false, 'deleted account is blocked');

select * from finish();
rollback;
