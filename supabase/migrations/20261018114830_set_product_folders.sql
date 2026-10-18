SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.set_product_folders (
  target_product_id bigint,
  folder_ids        bigint[]
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  current_user_id uuid := (select auth.uid());
  selected bigint[] := coalesce(folder_ids, '{}');
  owned_folder_id bigint;
  is_owned boolean;
begin
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  perform 1 from public.products
  where id = target_product_id and user_id = current_user_id
  for update;
  if not found then
    raise exception 'product_not_found' using errcode = '22023';
  end if;

  -- 남의 폴더나 없는 폴더가 섞이면 아무것도 바꾸지 않는다.
  if exists (
    select 1 from unnest(selected) as picked(id)
    where not exists (
      select 1 from public.folders f where f.id = picked.id and f.user_id = current_user_id
    )
  ) then
    raise exception 'folder_not_found' using errcode = '22023';
  end if;

  select id into owned_folder_id
  from public.folders
  where user_id = current_user_id and kind = 'owned';

  select exists (
    select 1 from public.product_folders
    where product_id = target_product_id and folder_id = owned_folder_id
  ) into is_owned;

  -- 나의 소장템은 위시레벨 규칙이 있어 set_owned로만 넣고 뺀다.
  if (owned_folder_id = any(selected)) is distinct from is_owned then
    perform private.set_owned(target_product_id, owned_folder_id = any(selected));
  end if;

  delete from public.product_folders pf
  using public.folders f
  where pf.product_id = target_product_id
    and f.id = pf.folder_id
    and f.kind = 'custom'
    and not (pf.folder_id = any(selected));

  insert into public.product_folders (product_id, folder_id, user_id)
  select target_product_id, f.id, current_user_id
  from public.folders f
  where f.user_id = current_user_id and f.kind = 'custom' and f.id = any(selected)
  on conflict do nothing;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_product_folders (
  target_product_id bigint,
  folder_ids        bigint[]
)
  RETURNS void
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.set_product_folders(target_product_id, folder_ids);
$function$;

REVOKE ALL ON FUNCTION "public"."set_product_folders"(bigint, bigint[]) FROM PUBLIC, "anon";

REVOKE ALL ON FUNCTION "private"."set_product_folders"(bigint, bigint[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."set_product_folders"(bigint, bigint[]) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."set_product_folders"(bigint, bigint[]) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."set_product_folders"(bigint, bigint[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_product_folders"(bigint, bigint[]) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_product_folders"(bigint, bigint[]) TO "service_role";
