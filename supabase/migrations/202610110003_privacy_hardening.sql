-- User deletion is distinct from workspace deletion; no email is stored here.
create table public.account_deletion_requests(user_id uuid primary key references auth.users(id) on delete cascade,requested_at timestamptz not null default now(),due_at timestamptz not null default now()+interval '30 days');
alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from anon,authenticated;
grant all on public.account_deletion_requests to service_role;
create function public.request_account_deletion() returns void language plpgsql security definer set search_path='' as $$ declare org record;begin
 if auth.uid() is null then raise exception 'ROLE_REQUIRED';end if;
 insert into public.account_deletion_requests(user_id) values(auth.uid()) on conflict(user_id) do nothing;
 for org in select organization_id from public.organization_members where user_id=auth.uid() and role='organization_admin' loop
 update public.organizations set status='deleting',deletion_requested_at=coalesce(deletion_requested_at,now()),deletion_due_at=coalesce(deletion_due_at,now()+interval '30 days') where id=org.organization_id;
 perform public.audit_mutation(auth.uid(),org.organization_id,'account_deletion_requested','user',auth.uid()::text);
 end loop;
 delete from public.organization_members where user_id=auth.uid() and role='location_manager';
 end; $$;
revoke all on function public.request_account_deletion() from public,anon,authenticated;
grant execute on function public.request_account_deletion() to authenticated;
create function public.valid_timezone(p_value text) returns boolean language sql stable set search_path='' as $$ select exists(select 1 from pg_catalog.pg_timezone_names where name=p_value); $$;
revoke all on function public.valid_timezone(text) from public,anon,authenticated;
grant execute on function public.valid_timezone(text) to authenticated,service_role;
alter table public.locations add constraint valid_location_timezone check(public.valid_timezone(timezone));
alter table public.locations add constraint valid_location_locale check(locale in('en','hi','en-IN','hi-IN'));
alter table public.locations add constraint valid_location_category check(length(category) between 2 and 50);
alter table public.locations add constraint valid_location_address check(length(address)<=300);
alter table public.locations add constraint valid_location_country check(country_code ~ '^[A-Z]{2}$');
alter table public.organizations add constraint valid_org_country check(country_code ~ '^[A-Z]{2}$');
alter table public.organizations add constraint valid_org_locale check(default_locale in('en','hi','en-IN','hi-IN'));

alter table public.checkout_requests add column last_reconciled_at timestamptz;
create index checkout_reconciliation_idx on public.checkout_requests(last_reconciled_at) where status in('pending','ready','active');
create function public.prevent_pending_account_membership() returns trigger language plpgsql security definer set search_path='' as $$ begin if exists(select 1 from public.account_deletion_requests where user_id=new.user_id) then raise exception 'ROLE_REQUIRED';end if;return new;end; $$;
revoke all on function public.prevent_pending_account_membership() from public,anon,authenticated;
create trigger deny_pending_account_membership before insert or update on public.organization_members for each row execute function public.prevent_pending_account_membership();
create table public.technical_errors(request_id uuid primary key,route text not null,error_code text not null,created_at timestamptz not null default now());
alter table public.technical_errors enable row level security;
revoke all on public.technical_errors from anon,authenticated;
grant all on public.technical_errors to service_role;
create index technical_errors_time_idx on public.technical_errors(created_at desc);
