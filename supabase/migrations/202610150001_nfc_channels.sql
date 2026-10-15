-- NFC tags share the stable, revocable customer-link lifecycle and tenant RLS.
-- One record per physical tag; channel describes distribution, not proof of a tap.
alter table public.qr_codes
  add column channel text not null default 'qr' check (channel in ('qr','nfc')),
  add column placement text not null default '' check (length(placement) <= 100);
create index qr_codes_org_channel on public.qr_codes(organization_id,channel);

create or replace function public.upsert_qr(p_org uuid,p_id uuid,p_values jsonb,p_key text,p_slug text)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; loc uuid; medium text; prior public.qr_codes;
begin
  if p_id is null then
    loc := (p_values->>'location_id')::uuid;
    medium := coalesce(p_values->>'channel','qr');
    if p_key is null or p_key !~ '^[A-Za-z0-9_-]{16,100}$' then
      raise exception 'INVALID_IDEMPOTENCY_KEY';
    end if;
  else
    select * into prior from public.qr_codes where id=p_id and organization_id=p_org;
    loc := prior.location_id;
    medium := prior.channel;
    if p_values ?| array['channel','location_id','slug','organization_id'] then
      raise exception 'INVALID_LINK_UPDATE';
    end if;
  end if;
  if loc is null or not public.can_access_location(p_org,loc) then
    raise exception 'TENANT_ACCESS_DENIED';
  end if;
  -- Serialize creation and quota checks for a location.
  perform 1 from public.locations where id=loc and organization_id=p_org for update;
  if p_id is null then
    select result_id into result from public.idempotency_records
      where user_id=auth.uid() and operation='create_qr:'||p_org::text and key=p_key;
    if result is not null then
      -- A retried key must never return an inaccessible or different channel link.
      if not exists(select 1 from public.qr_codes where id=result and location_id=loc and organization_id=p_org and channel=medium) then
        raise exception 'IDEMPOTENCY_CONFLICT';
      end if;
      return result;
    end if;
    if (select count(*) from public.qr_codes where location_id=loc and organization_id=p_org) >= 500 then
      raise exception 'LINK_LIMIT';
    end if;
    insert into public.qr_codes(organization_id,location_id,slug,label,brand_color,channel,placement)
      values(p_org,loc,p_slug,p_values->>'label',coalesce(p_values->>'brand_color','#315b43'),medium,coalesce(p_values->>'placement','')) returning id into result;
    insert into public.idempotency_records(organization_id,user_id,operation,key,result_id)
      values(p_org,auth.uid(),'create_qr:'||p_org::text,p_key,result);
  else
    result := p_id;
    update public.qr_codes set label=coalesce(p_values->>'label',label),
      brand_color=coalesce(p_values->>'brand_color',brand_color),
      placement=coalesce(p_values->>'placement',placement),
      is_active=coalesce((p_values->>'is_active')::boolean,is_active)
      where id=result and organization_id=p_org;
  end if;
  insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id)
    values(auth.uid(),p_org,medium||case when p_id is null then '_created' else '_updated' end,
      case when medium='nfc' then 'nfc_tag' else 'qr_code' end,result::text);
  return result;
end;
$$;
revoke all on function public.upsert_qr(uuid,uuid,jsonb,text,text) from public,anon;
grant execute on function public.upsert_qr(uuid,uuid,jsonb,text,text) to authenticated;
