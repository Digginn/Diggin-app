CREATE OR REPLACE FUNCTION private.invoke_notification_push()
  RETURNS bigint
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  function_url text;
  dispatch_secret text;
begin
  if not exists (
    select 1 from private.notification_push_deliveries
    where state in ('pending','receipt') and available_at <= now()
      and (leased_until is null or leased_until <= now())
  ) then return null; end if;
  select decrypted_secret into function_url from vault.decrypted_secrets where name = 'push_dispatch_url';
  select decrypted_secret into dispatch_secret from vault.decrypted_secrets where name = 'push_dispatch_secret';
  if function_url is null or dispatch_secret is null then return null; end if;
  return net.http_post(url := function_url,
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || dispatch_secret),
    body := '{}'::jsonb, timeout_milliseconds := 10000);
end;
$function$;

-- pg_cron 작업은 선언형 diff 대상이 아니므로 스키마의 등록문을 함께 반영한다.
select cron.schedule('cron-run-details-cleanup', '10 18 * * *', $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$);
