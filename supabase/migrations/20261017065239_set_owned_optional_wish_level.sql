SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.set_owned (
  target_product_id  bigint,
  is_owned           boolean,
  keep_other_folders boolean           DEFAULT true,
  new_wish_level     public.wish_level DEFAULT NULL::public.wish_level
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  current_user_id uuid := (select auth.uid());
  owned_folder_id bigint;
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

  select id into owned_folder_id
  from public.folders
  where user_id = current_user_id and kind = 'owned';

  if is_owned then
    update public.products set wish_level = null where id = target_product_id;
    insert into public.product_folders (product_id, folder_id, user_id)
    values (target_product_id, owned_folder_id, current_user_id)
    on conflict do nothing;
    if not keep_other_folders then
      delete from public.product_folders
      where product_id = target_product_id and folder_id <> owned_folder_id;
    end if;
  else
    -- 해제할 때 위시레벨을 고르지 않으면 미선택(null)으로 둔다. 저장할 때 미선택을 허용하는 것(SAVE-011)과 같다.
    delete from public.product_folders
    where product_id = target_product_id and folder_id = owned_folder_id;
    update public.products set wish_level = new_wish_level where id = target_product_id;
  end if;
end;
$function$;
