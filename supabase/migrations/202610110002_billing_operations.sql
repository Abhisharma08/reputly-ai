create function public.prepare_checkout(p_org uuid,p_plan uuid,p_key text,p_external text) returns public.checkout_requests language plpgsql security definer set search_path='' as $$ declare result public.checkout_requests;sub public.subscriptions;lim integer;begin
 perform 1 from public.organizations where id=p_org and status='active' for update;if not found then raise exception 'TENANT_ACCESS_DENIED';end if;
 select * into result from public.checkout_requests where organization_id=p_org and idempotency_key=p_key;if found then return result;end if;
 select * into sub from public.subscriptions where organization_id=p_org;
 if sub.provider_subscription_id is not null and(sub.status in('active','past_due') or sub.current_period_end>now()) then raise exception 'ACTIVE_SUBSCRIPTION';end if;
 select * into result from public.checkout_requests where organization_id=p_org and status in('pending','ready') for update;if found then if result.plan_id=p_plan then return result;else raise exception 'PLAN_CHANGE_PENDING';end if;end if;
 select location_limit into lim from public.plans where id=p_plan and is_active and currency='INR';if lim is null then raise exception 'ROLE_REQUIRED';end if;
 if(select count(*) from public.locations where organization_id=p_org and status<>'archived')>lim then raise exception 'LOCATION_LIMIT';end if;
 insert into public.checkout_requests(organization_id,plan_id,idempotency_key,provider_subscription_id) values(p_org,p_plan,p_key,p_external) returning * into result;return result;end; $$;
create function public.apply_billing_event(p_event text,p_type text,p_external text,p_status text,p_payment text,p_amount integer,p_currency text,p_paid_at timestamptz,p_payment_type text) returns boolean language plpgsql security definer set search_path='' as $$ declare chk public.checkout_requests;sub public.subscriptions;plan public.plans;existing public.billing_events;new_payment uuid;begin
 perform pg_advisory_xact_lock(hashtextextended(p_event,0));select * into existing from public.billing_events where provider_event_id=p_event;if found and existing.status in('processed','ignored') then return false;end if;
 insert into public.billing_events(provider_event_id,event_type) values(p_event,p_type) on conflict(provider_event_id) do nothing;
 select * into chk from public.checkout_requests where provider_subscription_id=p_external for update;
 if not found then update public.billing_events set status='ignored',processed_at=now() where provider_event_id=p_event;return false;end if;
 select * into sub from public.subscriptions where organization_id=chk.organization_id for update;select * into plan from public.plans where id=chk.plan_id;
 if p_type='SUBSCRIPTION_PAYMENT_SUCCESS' and p_status='SUCCESS' and p_payment_type='CHARGE' and p_amount=plan.amount_minor and p_currency=plan.currency and p_payment is not null and p_paid_at is not null then
 insert into public.payment_records(organization_id,subscription_id,provider_payment_id,amount_minor,currency,status,paid_at) values(chk.organization_id,sub.id,p_payment,p_amount,p_currency,'success',p_paid_at) on conflict(provider_payment_id) do nothing returning id into new_payment;
 if new_payment is not null and(sub.provider_subscription_id is null or sub.provider_subscription_id=p_external or sub.current_period_end<=now()) and(sub.current_period_end is null or p_paid_at+interval '1 month'>sub.current_period_end or sub.provider_subscription_id is distinct from p_external) then
 update public.subscriptions set plan_id=chk.plan_id,provider_subscription_id=p_external,status=case when chk.status='cancelled' or(status='cancelled' and provider_subscription_id=p_external) then 'cancelled' else 'active' end,current_period_start=case when current_period_end is null or p_paid_at>=current_period_end then p_paid_at else current_period_start end,current_period_end=greatest(coalesce(current_period_end,p_paid_at),p_paid_at+interval '1 month'),grace_until=null,last_reconciled_at=now() where id=sub.id;
 update public.checkout_requests set status=case when status='cancelled' then 'cancelled' else 'active' end,subscription_session_id=null where id=chk.id;
 insert into public.audit_logs(organization_id,action,entity_type,entity_id,metadata_safe_json) values(chk.organization_id,'subscription_payment_received','subscription',sub.id::text,jsonb_build_object('payment_id',p_payment));end if;
 elsif p_type='SUBSCRIPTION_REFUND_STATUS' and p_status='SUCCESS' then
 update public.payment_records set status='refunded' where organization_id=chk.organization_id and provider_payment_id=p_payment and p_amount=amount_minor;
 insert into public.audit_logs(organization_id,action,entity_type,entity_id) values(chk.organization_id,'refund_recorded','payment',p_payment);
 elsif p_type='SUBSCRIPTION_PAYMENT_FAILED' and p_status='FAILED' and p_payment_type='CHARGE' and p_paid_at>=coalesce(sub.current_period_end,p_paid_at) and sub.status<>'cancelled' and sub.provider_subscription_id=p_external and coalesce(sub.current_period_end,now())<=now() then
 update public.subscriptions set status='past_due',grace_until=coalesce(grace_until,now()+interval '3 days'),last_reconciled_at=now() where id=sub.id;
 elsif p_type='SUBSCRIPTION_STATUS_CHANGED' and p_status in('CANCELLED','CUSTOMER_CANCELLED','COMPLETED','EXPIRED','LINK_EXPIRED') then
 update public.checkout_requests set status='cancelled',subscription_session_id=null where id=chk.id;
 if sub.provider_subscription_id=p_external then update public.subscriptions set status='cancelled',last_reconciled_at=now() where id=sub.id;end if;
 end if;
 update public.billing_events set status='processed',processed_at=now() where provider_event_id=p_event;return true;end; $$;
create function public.audit_mutation(p_actor uuid,p_org uuid,p_action text,p_type text,p_id text) returns void language sql security definer set search_path='' as $$ insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id) values(p_actor,p_org,p_action,p_type,p_id); $$;
create function public.admin_set_org_status(p_actor uuid,p_org uuid,p_status text,p_reason text) returns void language plpgsql security definer set search_path='' as $$ begin if p_status not in('active','suspended') then raise exception 'ROLE_REQUIRED';end if;update public.organizations set status=p_status where id=p_org and status<>'deleting';if not found then raise exception 'TENANT_ACCESS_DENIED';end if;insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id,metadata_safe_json) values(p_actor,p_org,'admin_'||p_status,'organization',p_org::text,jsonb_build_object('reason',left(p_reason,300)));end; $$;
create function public.maintenance_cleanup() returns jsonb language plpgsql security definer set search_path='' as $$ declare sessions_count integer;events_count integer;expired_usage record;begin
 delete from public.public_sessions where expires_at<now()-interval '48 hours';get diagnostics sessions_count=row_count;
 delete from public.analytics_events where occurred_at<now()-interval '90 days';get diagnostics events_count=row_count;
 delete from public.analytics_daily where day<(now()-interval '24 months')::date;
 delete from public.rate_limits where window_start<now()-interval '2 days';
 delete from public.member_invitations where expires_at<now()-interval '30 days';
 delete from public.idempotency_records where created_at<now()-interval '90 days';
 delete from public.audit_logs where created_at<now()-interval '24 months';
 for expired_usage in select id from public.ai_usage where status='reserved' and created_at<now()-interval '1 hour' loop perform public.finish_ai(expired_usage.id,'failed',0,0);end loop;
 delete from public.ai_usage where created_at<now()-interval '90 days' and status<>'reserved';
 delete from public.billing_events where received_at<now()-interval '90 days';
 -- Failed/expired provider calls are handled by reconciliation. No entitlement is
 -- granted simply because the browser returned from checkout.
 update public.subscriptions set status='expired' where(status='trialing' and trial_ends_at<now()) or(status='past_due' and grace_until<now()) or(status='cancelled' and current_period_end<now());
 return jsonb_build_object('sessions_deleted',sessions_count,'events_deleted',events_count);end; $$;
-- Privacy jobs remove operational customer data but retain payment records and
-- their organization IDs until the legally configured billing-retention period.
create function public.remove_due_org_data() returns integer language plpgsql security definer set search_path='' as $$ declare org record;n integer:=0;begin
 for org in select id from public.organizations where status='deleting' and deletion_due_at<=now() and name<>'Deleted organization' for update skip locked loop
 if exists(select 1 from public.subscriptions where organization_id=org.id and provider_subscription_id is not null and status not in('cancelled','expired')) or exists(select 1 from public.checkout_requests where organization_id=org.id and status in('pending','ready','active')) then continue;end if;
 delete from public.locations where organization_id=org.id;
 delete from public.member_invitations where organization_id=org.id;
 delete from public.organization_members where organization_id=org.id;
 delete from public.ai_usage where organization_id=org.id;
 delete from public.usage_counters where organization_id=org.id;
 delete from public.idempotency_records where organization_id=org.id;
 update public.organizations set name='Deleted organization',default_locale='en',terms_accepted_at=created_at where id=org.id;
 perform public.audit_mutation(null,org.id,'organization_data_removed','organization',org.id::text);n:=n+1;end loop;return n;end; $$;
revoke all on function public.prepare_checkout(uuid,uuid,text,text),public.apply_billing_event(text,text,text,text,text,integer,text,timestamptz,text),public.audit_mutation(uuid,uuid,text,text,text),public.admin_set_org_status(uuid,uuid,text,text),public.maintenance_cleanup(),public.remove_due_org_data() from public,anon,authenticated;
grant execute on function public.prepare_checkout(uuid,uuid,text,text),public.apply_billing_event(text,text,text,text,text,integer,text,timestamptz,text),public.audit_mutation(uuid,uuid,text,text,text),public.admin_set_org_status(uuid,uuid,text,text),public.maintenance_cleanup(),public.remove_due_org_data() to service_role;
