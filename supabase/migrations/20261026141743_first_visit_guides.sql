SET local check_function_bodies = off;

CREATE TABLE "private"."first_visit_guides" (
  "id"           bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "user_id"      uuid                     NOT NULL,
  "guide_kind"   text                     NOT NULL,
  "dismissed_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "first_visit_guides_guide_kind_check" CHECK ((guide_kind = ANY (ARRAY['all'::text, 'folder'::text, 'item-detail'::text]))),
  CONSTRAINT "first_visit_guides_pkey" PRIMARY KEY (id),
  CONSTRAINT "first_visit_guides_user_id_guide_kind_key" UNIQUE (user_id, guide_kind)
);

ALTER TABLE "private"."first_visit_guides"
  ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.dismiss_first_visit_guide (
  target_user_id    uuid,
  target_guide_kind text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  viewer_id uuid := (select auth.uid());
begin
  perform private.assert_account_access();
  if target_user_id is distinct from viewer_id then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if target_guide_kind is null or target_guide_kind not in ('all', 'folder', 'item-detail') then
    raise exception 'invalid_guide_kind' using errcode = '22023';
  end if;
  insert into private.first_visit_guides (user_id, guide_kind)
  values (viewer_id, target_guide_kind)
  on conflict (user_id, guide_kind) do nothing;
end;
$function$;

CREATE OR REPLACE FUNCTION private.get_first_visit_guides (
  target_user_id uuid
)
  RETURNS text[]
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  viewer_id uuid := (select auth.uid());
begin
  perform private.assert_account_access();
  if target_user_id is distinct from viewer_id then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return coalesce((
    select array_agg(guide.guide_kind order by guide.guide_kind)
    from private.first_visit_guides as guide
    where guide.user_id = viewer_id
  ), array[]::text[]);
end;
$function$;

CREATE OR REPLACE FUNCTION public.dismiss_first_visit_guide (
  target_user_id    uuid,
  target_guide_kind text
)
  RETURNS void
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.dismiss_first_visit_guide(target_user_id, target_guide_kind);
$function$;

REVOKE ALL ON FUNCTION "public"."dismiss_first_visit_guide"(uuid, text) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.get_first_visit_guides (
  target_user_id uuid
)
  RETURNS text[]
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.get_first_visit_guides(target_user_id);
$function$;

REVOKE ALL ON FUNCTION "public"."get_first_visit_guides"(uuid) FROM PUBLIC, "anon";

ALTER TABLE "private"."first_visit_guides"
  ADD CONSTRAINT "first_visit_guides_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

REVOKE ALL ON FUNCTION "private"."dismiss_first_visit_guide"(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."dismiss_first_visit_guide"(uuid, text) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."get_first_visit_guides"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."get_first_visit_guides"(uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."dismiss_first_visit_guide"(uuid, text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."dismiss_first_visit_guide"(uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."dismiss_first_visit_guide"(uuid, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."dismiss_first_visit_guide"(uuid, text) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."get_first_visit_guides"(uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."get_first_visit_guides"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_first_visit_guides"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_first_visit_guides"(uuid) TO "service_role";
