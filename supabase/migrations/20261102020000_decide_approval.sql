-- The decision itself, in one locked step so two taps (or a link and its twin) can't both win:
-- the first decision for a subject is final, and every sibling link for it is spent with it.
create or replace function public.decide_approval(p_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.approval_tokens%rowtype;
begin
  select * into t from public.approval_tokens where token_hash = p_hash for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'unknown'); end if;
  if t.decided_at is not null
     or exists (select 1 from public.approval_tokens o where o.subject_id = t.subject_id and o.purpose = t.purpose and o.decided_at is not null) then
    return jsonb_build_object('ok', false, 'reason', 'used');
  end if;
  if t.expires_at < now() then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  update public.approval_tokens set decided_at = now()
   where subject_id = t.subject_id and purpose = t.purpose and decided_at is null;
  return jsonb_build_object('ok', true, 'decision', t.decision, 'purpose', t.purpose, 'subject_id', t.subject_id, 'company_id', t.company_id);
end;
$$;
revoke execute on function public.decide_approval(text) from public, anon, authenticated;
