SET local check_function_bodies = off;

CREATE TABLE "public"."product_folders" (
  "product_id" bigint                   NOT NULL,
  "folder_id"  bigint                   NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "product_folders_pkey" PRIMARY KEY (product_id, folder_id),
  "user_id"    uuid                     NOT NULL DEFAULT auth.uid()
);

ALTER TABLE "public"."product_folders"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."product_folders" FROM "anon";

CREATE TABLE "public"."products" (
  "id"         bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "url"        text                     NOT NULL,
  "name"       text                     NOT NULL,
  "brand"      text,
  "price"      integer,
  "image_url"  text,
  "saved_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "products_brand_length" CHECK (((char_length(brand) >= 1) AND (char_length(brand) <= 30))),
  CONSTRAINT "products_name_length" CHECK (((char_length(name) >= 1) AND (char_length(name) <= 100))),
  CONSTRAINT "products_pkey" PRIMARY KEY (id),
  CONSTRAINT "products_price_non_negative" CHECK ((price >= 0)),
  CONSTRAINT "products_url_https" CHECK ((url ~* '^https://'::text)),
  "user_id"    uuid                     NOT NULL DEFAULT auth.uid(),
  CONSTRAINT "products_id_user_id_key" UNIQUE (id, user_id),
  CONSTRAINT "products_user_id_url_key" UNIQUE (user_id, url)
);

ALTER TABLE "public"."products"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."products" FROM "anon";

CREATE TYPE "public"."wish_level" AS ENUM (
  'high',
  'medium',
  'low'
);

ALTER TABLE "public"."products"
  ADD COLUMN "wish_level" public.wish_level;

CREATE OR REPLACE FUNCTION private.normalize_product()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  new.url := btrim(new.url);
  new.name := normalize(btrim(new.name), NFC);
  new.brand := nullif(normalize(btrim(new.brand), NFC), '');
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.product_input_error (
  product_url   text,
  product_name  text,
  product_brand text,
  product_price integer
)
  RETURNS text
  LANGUAGE plpgsql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
declare
  clean_name text := normalize(btrim(coalesce(product_name, '')), NFC);
  clean_brand text := normalize(btrim(coalesce(product_brand, '')), NFC);
begin
  if product_url is null or btrim(product_url) !~* '^https://' then
    return 'invalid_url';
  end if;
  if clean_name = '' then
    return 'name_required';
  end if;
  if char_length(clean_name) > 100 then
    return 'name_too_long';
  end if;
  if char_length(clean_brand) > 30 then
    return 'brand_too_long';
  end if;
  if product_price < 0 then
    return 'invalid_price';
  end if;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION private.reject_owned_product_wish_level()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if exists (
    select 1
    from public.product_folders pf
    join public.folders f on f.id = pf.folder_id
    where pf.product_id = new.id and f.kind = 'owned'
  ) then
    raise exception 'owned_product_wish_level' using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.reject_wish_level_in_owned_folder()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if exists (
    select 1
    from public.folders f
    join public.products p on p.id = new.product_id
    where f.id = new.folder_id and f.kind = 'owned' and p.wish_level is not null
  ) then
    raise exception 'owned_product_wish_level' using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.save_product (
  product_url        text,
  product_name       text,
  product_brand      text              DEFAULT NULL::text,
  product_price      integer           DEFAULT NULL::integer,
  product_image_url  text              DEFAULT NULL::text,
  product_wish_level public.wish_level DEFAULT NULL::public.wish_level,
  folder_ids         bigint[]          DEFAULT NULL::bigint[]
)
  RETURNS TABLE (
    product_id   bigint,
    is_duplicate boolean
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  current_user_id uuid := (select auth.uid());
  input_error text;
  saved_id bigint;
  is_owned boolean;
begin
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  input_error := private.product_input_error(product_url, product_name, product_brand, product_price);
  if input_error is not null then
    raise exception '%', input_error using errcode = '22023';
  end if;

  select p.id into saved_id
  from public.products p
  where p.user_id = current_user_id and p.url = btrim(product_url);
  if saved_id is not null then
    return query select saved_id, true;
    return;
  end if;

  -- 나의 소장템을 같이 고르면 위시레벨을 비운다(PDT-008).
  is_owned := exists (
    select 1 from public.folders f
    where f.id = any (coalesce(folder_ids, '{}')) and f.user_id = current_user_id and f.kind = 'owned'
  );

  insert into public.products (user_id, url, name, brand, price, image_url, wish_level)
  values (
    current_user_id,
    product_url,
    product_name,
    product_brand,
    product_price,
    product_image_url,
    case when is_owned then null else product_wish_level end
  )
  on conflict on constraint products_user_id_url_key do nothing
  returning id into saved_id;

  -- 같은 링크를 동시에 저장하면 먼저 들어간 상품을 돌려준다.
  if saved_id is null then
    select p.id into saved_id
    from public.products p
    where p.user_id = current_user_id and p.url = btrim(product_url);
    return query select saved_id, true;
    return;
  end if;

  insert into public.product_folders (product_id, folder_id, user_id)
  select saved_id, folder_id, current_user_id
  from unnest(coalesce(folder_ids, '{}')) as folder_id
  on conflict do nothing;

  return query select saved_id, false;
end;
$function$;

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
    if new_wish_level is null then
      raise exception 'wish_level_required' using errcode = '22023';
    end if;
    delete from public.product_folders
    where product_id = target_product_id and folder_id = owned_folder_id;
    update public.products set wish_level = new_wish_level where id = target_product_id;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION private.touch_folder_last_added()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  update public.folders set last_added_at = new.created_at where id = new.folder_id;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_product (
  product_url        text,
  product_name       text,
  product_brand      text              DEFAULT NULL::text,
  product_price      integer           DEFAULT NULL::integer,
  product_image_url  text              DEFAULT NULL::text,
  product_wish_level public.wish_level DEFAULT NULL::public.wish_level,
  folder_ids         bigint[]          DEFAULT NULL::bigint[]
)
  RETURNS TABLE (
    product_id   bigint,
    is_duplicate boolean
  )
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select * from private.save_product(
    product_url,
    product_name,
    product_brand,
    product_price,
    product_image_url,
    product_wish_level,
    folder_ids
  );
$function$;

REVOKE ALL ON FUNCTION "public"."save_product"(text, text, text, integer, text, public.wish_level, bigint[]) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.set_owned (
  target_product_id  bigint,
  is_owned           boolean,
  keep_other_folders boolean           DEFAULT true,
  new_wish_level     public.wish_level DEFAULT NULL::public.wish_level
)
  RETURNS void
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.set_owned(target_product_id, is_owned, keep_other_folders, new_wish_level);
$function$;

REVOKE ALL ON FUNCTION "public"."set_owned"(bigint, boolean, boolean, public.wish_level) FROM PUBLIC, "anon";

CREATE INDEX product_folders_folder_id_created_at_idx ON public.product_folders USING btree (folder_id, created_at DESC);

CREATE TRIGGER product_folders_reject_owned_wish_level
  BEFORE INSERT ON public.product_folders
  FOR EACH ROW
  EXECUTE FUNCTION private.reject_wish_level_in_owned_folder();

CREATE TRIGGER product_folders_touch_folder
  AFTER INSERT ON public.product_folders
  FOR EACH ROW
  EXECUTE FUNCTION private.touch_folder_last_added();

CREATE TRIGGER products_normalize
  BEFORE INSERT OR UPDATE OF url, name, brand ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION private.normalize_product();

CREATE TRIGGER products_reject_owned_wish_level
  BEFORE UPDATE OF wish_level ON public.products
  FOR EACH ROW
  WHEN ((new.wish_level IS NOT NULL))
  EXECUTE FUNCTION private.reject_owned_product_wish_level();

CREATE TRIGGER products_set_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION private.set_updated_at();

REVOKE ALL ON FUNCTION "private"."normalize_product"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."product_input_error"(text, text, text, integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."reject_owned_product_wish_level"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."reject_wish_level_in_owned_folder"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."save_product"(text, text, text, integer, text, public.wish_level, bigint[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."save_product"(text, text, text, integer, text, public.wish_level, bigint[]) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."set_owned"(bigint, boolean, boolean, public.wish_level) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."set_owned"(bigint, boolean, boolean, public.wish_level) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."touch_folder_last_added"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."save_product"(text, text, text, integer, text, public.wish_level, bigint[]) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."save_product"(text, text, text, integer, text, public.wish_level, bigint[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."save_product"(text, text, text, integer, text, public.wish_level, bigint[]) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."save_product"(text, text, text, integer, text, public.wish_level, bigint[]) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."set_owned"(bigint, boolean, boolean, public.wish_level) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."set_owned"(bigint, boolean, boolean, public.wish_level) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_owned"(bigint, boolean, boolean, public.wish_level) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_owned"(bigint, boolean, boolean, public.wish_level) TO "service_role";

REVOKE ALL ON SEQUENCE "public"."products_id_seq" FROM "anon";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."products_id_seq" TO "anon";

REVOKE ALL ON SEQUENCE "public"."products_id_seq" FROM "authenticated";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."products_id_seq" TO "authenticated";

REVOKE ALL ON SEQUENCE "public"."products_id_seq" FROM "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."products_id_seq" TO "postgres";

REVOKE ALL ON SEQUENCE "public"."products_id_seq" FROM "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."products_id_seq" TO "service_role";

REVOKE ALL ON TABLE "public"."product_folders" FROM "authenticated";

REVOKE ALL ("folder_id") ON TABLE "public"."product_folders" FROM "authenticated";

GRANT INSERT ("folder_id") ON TABLE "public"."product_folders" TO "authenticated";

REVOKE ALL ("product_id") ON TABLE "public"."product_folders" FROM "authenticated";

GRANT INSERT ("product_id") ON TABLE "public"."product_folders" TO "authenticated";

GRANT DELETE, SELECT ON TABLE "public"."product_folders" TO "authenticated";

REVOKE ALL ON TABLE "public"."product_folders" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."product_folders" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."product_folders" TO "service_role";

REVOKE ALL ON TABLE "public"."products" FROM "authenticated";

REVOKE ALL ("brand") ON TABLE "public"."products" FROM "authenticated";

GRANT UPDATE ("brand") ON TABLE "public"."products" TO "authenticated";

REVOKE ALL ("name") ON TABLE "public"."products" FROM "authenticated";

GRANT UPDATE ("name") ON TABLE "public"."products" TO "authenticated";

REVOKE ALL ("price") ON TABLE "public"."products" FROM "authenticated";

GRANT UPDATE ("price") ON TABLE "public"."products" TO "authenticated";

REVOKE ALL ("wish_level") ON TABLE "public"."products" FROM "authenticated";

GRANT UPDATE ("wish_level") ON TABLE "public"."products" TO "authenticated";

GRANT DELETE, SELECT ON TABLE "public"."products" TO "authenticated";

REVOKE ALL ON TABLE "public"."products" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."products" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."products" TO "service_role";

ALTER TABLE "public"."product_folders"
  ADD CONSTRAINT "product_folders_folder_fkey" FOREIGN KEY (folder_id, user_id) REFERENCES public.folders(id, user_id) ON DELETE CASCADE;

CREATE INDEX product_folders_user_id_idx ON public.product_folders USING btree (user_id);

CREATE POLICY "product_folders_delete_own_custom" ON "public"."product_folders"
  FOR DELETE
  TO "authenticated"
  USING (((( SELECT auth.uid() AS uid) = user_id) AND (EXISTS ( SELECT 1
   FROM public.folders f
  WHERE ((f.id = product_folders.folder_id) AND (f.user_id = ( SELECT auth.uid() AS uid)) AND (f.kind = 'custom'::public.folder_kind))))));

CREATE POLICY "product_folders_insert_own_custom" ON "public"."product_folders"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND (EXISTS ( SELECT 1
   FROM public.folders f
  WHERE ((f.id = product_folders.folder_id) AND (f.user_id = ( SELECT auth.uid() AS uid)) AND (f.kind = 'custom'::public.folder_kind))))));

CREATE POLICY "product_folders_select_own" ON "public"."product_folders"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

ALTER TABLE "public"."product_folders"
  ADD CONSTRAINT "product_folders_product_fkey" FOREIGN KEY (product_id, user_id) REFERENCES public.products(id, user_id) ON DELETE CASCADE;

ALTER TABLE "public"."products"
  ADD CONSTRAINT "products_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX products_user_id_saved_at_idx ON public.products USING btree (user_id, saved_at DESC, id DESC);

CREATE POLICY "products_delete_own" ON "public"."products"
  FOR DELETE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "products_select_own" ON "public"."products"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "products_update_own" ON "public"."products"
  FOR UPDATE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
