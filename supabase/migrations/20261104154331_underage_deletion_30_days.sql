SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.due_underage_deletions()
  RETURNS TABLE (
    user_id             uuid,
    apple_refresh_token text
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select p.id, secret.decrypted_secret
  from public.profiles p
  join lateral (
    select s.reason_category, s.created_at from private.user_sanctions s
    where s.user_id = p.id and s.kind = 'suspended' and s.released_at is null
    order by s.id desc limit 1
  ) sanction on true
  left join private.apple_refresh_tokens token on token.user_id = p.id
  left join vault.decrypted_secrets secret on secret.id = token.secret_id
  where p.status = 'suspended' and sanction.reason_category = 'underage'
    and sanction.created_at <= now() - interval '30 days'
    and not exists (select 1 from private.underage_deletion_claims c where c.user_id = p.id and c.claimed_at > now() - interval '1 hour')
  order by sanction.created_at
  limit 50;
$function$;

CREATE OR REPLACE FUNCTION private.is_underage_deletion_due (
  target uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists (
    select 1 from public.profiles p
    join lateral (
      select s.reason_category, s.created_at from private.user_sanctions s
      where s.user_id = p.id and s.kind = 'suspended' and s.released_at is null
      order by s.id desc limit 1
    ) sanction on true
    where p.id = target and p.status = 'suspended' and sanction.reason_category = 'underage'
      and sanction.created_at <= now() - interval '30 days'
  );
$function$;
