SET local check_function_bodies = off;

CREATE SCHEMA "private";

CREATE TABLE "private"."nickname_allowed_words" (
  "word" text NOT NULL,
  CONSTRAINT "nickname_allowed_words_lowercase" CHECK ((word = lower(word))),
  CONSTRAINT "nickname_allowed_words_pkey" PRIMARY KEY (word)
);

ALTER TABLE "private"."nickname_allowed_words"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."nickname_banned_words" (
  "word" text NOT NULL,
  "kind" text NOT NULL,
  CONSTRAINT "nickname_banned_words_kind" CHECK ((kind = ANY (ARRAY['profanity'::text, 'impersonation'::text]))),
  CONSTRAINT "nickname_banned_words_lowercase" CHECK ((word = lower(word))),
  CONSTRAINT "nickname_banned_words_pkey" PRIMARY KEY (word)
);

ALTER TABLE "private"."nickname_banned_words"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."user_policy_consents" (
  "user_id"     uuid                     NOT NULL,
  "policy_id"   bigint                   NOT NULL,
  "accepted_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "user_policy_consents_pkey" PRIMARY KEY (user_id, policy_id)
);

ALTER TABLE "private"."user_policy_consents"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."withdrawal_surveys" (
  "id"          bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "custom_text" text,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "withdrawal_surveys_custom_text_length" CHECK ((char_length(custom_text) <= 100)),
  CONSTRAINT "withdrawal_surveys_pkey" PRIMARY KEY (id)
);

ALTER TABLE "private"."withdrawal_surveys"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."folders" (
  "id"            bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "name"          text                     NOT NULL,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "last_added_at" timestamp with time zone,
  CONSTRAINT "folders_pkey" PRIMARY KEY (id),
  "user_id"       uuid                     NOT NULL DEFAULT auth.uid(),
  CONSTRAINT "folders_id_user_id_key" UNIQUE (id, user_id),
  CONSTRAINT "folders_user_id_name_key" UNIQUE (user_id, name)
);

ALTER TABLE "public"."folders"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."folders" FROM "anon";

CREATE TABLE "public"."legal_policies" (
  "id"                 bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "kind"               text                     NOT NULL,
  "version"            text                     NOT NULL,
  "effective_at"       timestamp with time zone NOT NULL,
  "document_url"       text                     NOT NULL,
  "requires_reconsent" boolean                  NOT NULL DEFAULT false,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "legal_policies_document_url_https" CHECK ((document_url ~* '^https://'::text)),
  CONSTRAINT "legal_policies_kind_version_key" UNIQUE (kind, VERSION),
  CONSTRAINT "legal_policies_kind" CHECK ((kind = ANY (ARRAY['terms'::text, 'privacy'::text]))),
  CONSTRAINT "legal_policies_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."legal_policies"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."profiles" (
  "id"               uuid                     NOT NULL,
  "nickname"         text                     NOT NULL,
  "avatar_path"      text,
  "restricted_until" timestamp with time zone,
  "suspended_at"     timestamp with time zone,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "profiles_nickname_format" CHECK ((nickname ~ '^[가-힣A-Za-z0-9]{2,10}$'::text)),
  CONSTRAINT "profiles_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."profiles"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."profiles" FROM "anon";

CREATE TABLE "public"."push_tokens" (
  "id"         bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "user_id"    uuid                     NOT NULL,
  "token"      text                     NOT NULL,
  "platform"   text                     NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "push_tokens_pkey" PRIMARY KEY (id),
  CONSTRAINT "push_tokens_platform" CHECK ((platform = ANY (ARRAY['ios'::text, 'android'::text]))),
  CONSTRAINT "push_tokens_token_key" UNIQUE (token)
);

ALTER TABLE "public"."push_tokens"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."push_tokens" FROM "anon";

CREATE TYPE "public"."account_status" AS ENUM (
  'active',
  'warning',
  'community_restricted',
  'suspended'
);

ALTER TABLE "public"."profiles"
  ADD COLUMN "status" public.account_status NOT NULL DEFAULT 'active'::public.account_status;

CREATE TYPE "public"."folder_kind" AS ENUM (
  'custom',
  'owned'
);

ALTER TABLE "public"."folders"
  ADD COLUMN "kind" public.folder_kind NOT NULL DEFAULT 'custom'::public.folder_kind;

CREATE TYPE "public"."withdrawal_reason" AS ENUM (
  'rarely_used',
  'missing_feature',
  'other_service',
  'hard_to_use',
  'frequent_error'
);

ALTER TABLE "private"."withdrawal_surveys"
  ADD COLUMN "reasons" public.withdrawal_reason[] NOT NULL DEFAULT '{}'::public.withdrawal_reason[];

CREATE OR REPLACE FUNCTION private.accept_policy (
  target_policy_id bigint
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.legal_policies where id = target_policy_id and effective_at <= now()
  ) then
    raise exception 'policy_not_effective' using errcode = '22023';
  end if;

  insert into private.user_policy_consents (user_id, policy_id)
  values (current_user_id, target_policy_id)
  on conflict do nothing;
end;
$function$;

CREATE OR REPLACE FUNCTION private.char_count (
  value text
)
  RETURNS integer
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select char_length(regexp_replace(value, '[̀-ͯ︎️‍\U0001F3FB-\U0001F3FF]', '', 'g'))
    - (char_length(value) - char_length(replace(value, U&'\200D', '')))
    - (char_length(value) - char_length(regexp_replace(value, '[\U0001F1E6-\U0001F1FF]', '', 'g'))) / 2;
$function$;

CREATE OR REPLACE FUNCTION private.enforce_folder_limit()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if new.kind = 'custom' then
    perform 1 from public.profiles where id = new.user_id for update;
    if (select count(*) from public.folders where user_id = new.user_id and kind = 'custom') >= 50 then
      raise exception 'folder_limit_reached' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.generate_nickname()
  RETURNS text
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  candidate text;
begin
  for attempt in 1..50 loop
    candidate := '디깅' || lpad(floor(random() * 1000000)::integer::text, 6, '0');
    if private.nickname_error(candidate, null) is null then
      return candidate;
    end if;
  end loop;
  raise exception 'nickname_generation_failed';
end;
$function$;

CREATE OR REPLACE FUNCTION private.get_pending_policies()
  RETURNS SETOF public.legal_policies
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  return query
  select latest.*
  from (
    select distinct on (policy.kind) policy.*
    from public.legal_policies as policy
    where policy.effective_at <= now()
    order by policy.kind, policy.effective_at desc
  ) as latest
  where latest.requires_reconsent
    and not exists (
      select 1
      from private.user_policy_consents as consent
      where consent.user_id = current_user_id
        and consent.policy_id = latest.id
    );
end;
$function$;

CREATE OR REPLACE FUNCTION private.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  for attempt in 1..5 loop
    begin
      insert into public.profiles (id, nickname) values (new.id, private.generate_nickname());
      exit;
    exception when unique_violation then
      if attempt = 5 then
        raise;
      end if;
    end;
  end loop;

  insert into public.folders (user_id, kind, name) values (new.id, 'owned', '나의 소장템');
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.is_impersonation (
  nickname_lower text
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select nickname_lower in ('diggin', '디긴')
    or nickname_lower ~ '(운영자|관리자|운영진|admin|administrator)'
    or (
      nickname_lower ~ '(diggin|디긴)'
      and nickname_lower ~ '(공식|official|고객센터|customercenter|cs|운영팀|관리팀|team|staff|support|help|service)'
    )
    or exists (
      select 1
      from private.nickname_banned_words as banned
      where banned.kind = 'impersonation'
        and position(banned.word in nickname_lower) > 0
    );
$function$;

CREATE OR REPLACE FUNCTION private.nickname_error (
  nickname text,
  owner_id uuid
)
  RETURNS text
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  nickname_lower text := lower(nickname);
begin
  if nickname is null or private.char_count(nickname) not between 2 and 10 then
    return 'length';
  end if;
  if nickname ~ '\s' then
    return 'whitespace';
  end if;
  if nickname !~ '^[가-힣A-Za-z0-9]+$' then
    return 'invalid_characters';
  end if;
  if exists (
    select 1
    from private.nickname_banned_words as banned
    where banned.kind = 'profanity'
      and position(banned.word in nickname_lower) > 0
      and not exists (
        select 1
        from private.nickname_allowed_words as allowed
        where position(allowed.word in nickname_lower) > 0
          and position(banned.word in allowed.word) > 0
      )
  ) then
    return 'profanity';
  end if;
  if private.is_impersonation(nickname_lower) then
    return 'impersonation';
  end if;
  if exists (
    select 1
    from public.profiles as profile
    where lower(profile.nickname) = nickname_lower
      and profile.id is distinct from owner_id
  ) then
    return 'duplicate';
  end if;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION private.normalize_folder_name()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  new.name := normalize(btrim(new.name), NFC);
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.register_push_token (
  new_token    text,
  new_platform text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  insert into public.push_tokens (user_id, token, platform)
  values (current_user_id, new_token, new_platform)
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform;
end;
$function$;

CREATE OR REPLACE FUNCTION private.set_avatar (
  new_path text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if new_path is not null and new_path !~ ('^' || current_user_id::text || '/[^/]+$') then
    raise exception 'invalid_avatar_path' using errcode = '22023';
  end if;

  update public.profiles set avatar_path = new_path where id = current_user_id;
end;
$function$;

CREATE OR REPLACE FUNCTION private.set_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.update_nickname (
  new_nickname text
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  current_user_id uuid := (select auth.uid());
  error_code text;
begin
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  error_code := private.nickname_error(new_nickname, current_user_id);
  if error_code is not null then
    return error_code;
  end if;

  update public.profiles set nickname = new_nickname where id = current_user_id;
  return null;
exception when unique_violation then
  return 'duplicate';
end;
$function$;

CREATE OR REPLACE FUNCTION public.accept_policy (
  target_policy_id bigint
)
  RETURNS void
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.accept_policy(target_policy_id);
$function$;

REVOKE ALL ON FUNCTION "public"."accept_policy"(bigint) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.get_pending_policies()
  RETURNS SETOF public.legal_policies
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select * from private.get_pending_policies();
$function$;

REVOKE ALL ON FUNCTION "public"."get_pending_policies"() FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.register_push_token (
  new_token    text,
  new_platform text
)
  RETURNS void
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.register_push_token(new_token, new_platform);
$function$;

REVOKE ALL ON FUNCTION "public"."register_push_token"(text, text) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.set_avatar (
  new_path text
)
  RETURNS void
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.set_avatar(new_path);
$function$;

REVOKE ALL ON FUNCTION "public"."set_avatar"(text) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.update_nickname (
  new_nickname text
)
  RETURNS text
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.update_nickname(new_nickname);
$function$;

REVOKE ALL ON FUNCTION "public"."update_nickname"(text) FROM PUBLIC, "anon";

ALTER TABLE "private"."withdrawal_surveys"
  ADD CONSTRAINT "withdrawal_surveys_has_reason" CHECK (((cardinality(reasons) > 0) OR (length(btrim(custom_text)) > 0)));

ALTER TABLE "private"."user_policy_consents"
  ADD CONSTRAINT "user_policy_consents_policy_id_fkey" FOREIGN KEY (policy_id) REFERENCES public.legal_policies(id);

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "private"."user_policy_consents"
  ADD CONSTRAINT "user_policy_consents_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_restricted_until_required" CHECK (((status <> 'community_restricted'::public.account_status) OR (restricted_until IS NOT NULL)));

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_suspended_at_matches_status" CHECK (((status = 'suspended'::public.account_status) = (suspended_at IS NOT NULL)));

ALTER TABLE "public"."push_tokens"
  ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX user_policy_consents_policy_id_idx ON private.user_policy_consents USING btree (policy_id);

CREATE UNIQUE INDEX profiles_nickname_lower_key ON public.profiles USING btree (lower(nickname));

CREATE INDEX push_tokens_user_id_idx ON public.push_tokens USING btree (user_id);

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION private.handle_new_user();

CREATE TRIGGER folders_enforce_limit
  BEFORE INSERT ON public.folders
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_folder_limit();

CREATE TRIGGER folders_normalize_name
  BEFORE INSERT OR UPDATE OF name ON public.folders
  FOR EACH ROW
  EXECUTE FUNCTION private.normalize_folder_name();

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER push_tokens_set_updated_at
  BEFORE UPDATE ON public.push_tokens
  FOR EACH ROW
  EXECUTE FUNCTION private.set_updated_at();

CREATE POLICY "legal_policies_select_all" ON "public"."legal_policies"
  FOR SELECT
  TO "anon", "authenticated"
  USING (true);

CREATE POLICY "profiles_select_own" ON "public"."profiles"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = id));

CREATE POLICY "push_tokens_delete_own" ON "public"."push_tokens"
  FOR DELETE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "push_tokens_select_own" ON "public"."push_tokens"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "avatars_delete_own" ON "storage"."objects"
  FOR DELETE
  TO "authenticated"
  USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

CREATE POLICY "avatars_insert_own" ON "storage"."objects"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

CREATE POLICY "avatars_select_own" ON "storage"."objects"
  FOR SELECT
  TO "authenticated"
  USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

CREATE POLICY "avatars_update_own" ON "storage"."objects"
  FOR UPDATE
  TO "authenticated"
  USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)))
  WITH CHECK (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

REVOKE ALL ON FUNCTION "private"."accept_policy"(bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."accept_policy"(bigint) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."char_count"(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."char_count"(text) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."enforce_folder_limit"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."generate_nickname"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."get_pending_policies"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."get_pending_policies"() TO "authenticated";

REVOKE ALL ON FUNCTION "private"."handle_new_user"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."is_impersonation"(text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."nickname_error"(text, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."normalize_folder_name"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."register_push_token"(text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."register_push_token"(text, text) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."set_avatar"(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."set_avatar"(text) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."set_updated_at"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."update_nickname"(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."update_nickname"(text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."accept_policy"(bigint) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."accept_policy"(bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."accept_policy"(bigint) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."accept_policy"(bigint) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."get_pending_policies"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."get_pending_policies"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_pending_policies"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_pending_policies"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."register_push_token"(text, text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."register_push_token"(text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."register_push_token"(text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."register_push_token"(text, text) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."set_avatar"(text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."set_avatar"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_avatar"(text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_avatar"(text) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."update_nickname"(text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."update_nickname"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."update_nickname"(text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."update_nickname"(text) TO "service_role";

GRANT USAGE ON SCHEMA "private" TO "authenticated";

REVOKE ALL ON SEQUENCE "public"."folders_id_seq" FROM "anon";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."folders_id_seq" TO "anon";

REVOKE ALL ON SEQUENCE "public"."folders_id_seq" FROM "authenticated";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."folders_id_seq" TO "authenticated";

REVOKE ALL ON SEQUENCE "public"."folders_id_seq" FROM "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."folders_id_seq" TO "postgres";

REVOKE ALL ON SEQUENCE "public"."folders_id_seq" FROM "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."folders_id_seq" TO "service_role";

REVOKE ALL ON SEQUENCE "public"."legal_policies_id_seq" FROM "anon";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."legal_policies_id_seq" TO "anon";

REVOKE ALL ON SEQUENCE "public"."legal_policies_id_seq" FROM "authenticated";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."legal_policies_id_seq" TO "authenticated";

REVOKE ALL ON SEQUENCE "public"."legal_policies_id_seq" FROM "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."legal_policies_id_seq" TO "postgres";

REVOKE ALL ON SEQUENCE "public"."legal_policies_id_seq" FROM "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."legal_policies_id_seq" TO "service_role";

REVOKE ALL ON SEQUENCE "public"."push_tokens_id_seq" FROM "anon";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."push_tokens_id_seq" TO "anon";

REVOKE ALL ON SEQUENCE "public"."push_tokens_id_seq" FROM "authenticated";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."push_tokens_id_seq" TO "authenticated";

REVOKE ALL ON SEQUENCE "public"."push_tokens_id_seq" FROM "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."push_tokens_id_seq" TO "postgres";

REVOKE ALL ON SEQUENCE "public"."push_tokens_id_seq" FROM "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."push_tokens_id_seq" TO "service_role";

REVOKE ALL ON TABLE "public"."folders" FROM "authenticated";

REVOKE ALL ("name") ON TABLE "public"."folders" FROM "authenticated";

GRANT INSERT ("name"), UPDATE ("name") ON TABLE "public"."folders" TO "authenticated";

GRANT DELETE, SELECT ON TABLE "public"."folders" TO "authenticated";

REVOKE ALL ON TABLE "public"."folders" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."folders" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."folders" TO "service_role";

REVOKE ALL ON TABLE "public"."legal_policies" FROM "anon";

GRANT SELECT ON TABLE "public"."legal_policies" TO "anon";

REVOKE ALL ON TABLE "public"."legal_policies" FROM "authenticated";

GRANT SELECT ON TABLE "public"."legal_policies" TO "authenticated";

REVOKE ALL ON TABLE "public"."legal_policies" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."legal_policies" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."legal_policies" TO "service_role";

REVOKE ALL ON TABLE "public"."profiles" FROM "authenticated";

GRANT SELECT ON TABLE "public"."profiles" TO "authenticated";

REVOKE ALL ON TABLE "public"."profiles" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "service_role";

REVOKE ALL ON TABLE "public"."push_tokens" FROM "authenticated";

GRANT DELETE, SELECT ON TABLE "public"."push_tokens" TO "authenticated";

REVOKE ALL ON TABLE "public"."push_tokens" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."push_tokens" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."push_tokens" TO "service_role";

ALTER TABLE "public"."folders"
  ADD CONSTRAINT "folders_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX folders_one_owned_per_user ON public.folders USING btree (user_id)
  WHERE (kind = 'owned'::public.folder_kind);

CREATE POLICY "folders_delete_own_custom" ON "public"."folders"
  FOR DELETE
  TO "authenticated"
  USING (((( SELECT auth.uid() AS uid) = user_id) AND (kind = 'custom'::public.folder_kind)));

CREATE POLICY "folders_insert_own_custom" ON "public"."folders"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND (kind = 'custom'::public.folder_kind)));

CREATE POLICY "folders_select_own" ON "public"."folders"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "folders_update_own_custom" ON "public"."folders"
  FOR UPDATE
  TO "authenticated"
  USING (((( SELECT auth.uid() AS uid) = user_id) AND (kind = 'custom'::public.folder_kind)))
  WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND (kind = 'custom'::public.folder_kind)));

ALTER TABLE "public"."folders"
  ADD CONSTRAINT "folders_name_length" CHECK (((kind = 'owned'::public.folder_kind) OR ((private.char_count(name) >= 1) AND (private.char_count(name) <= 7))));
