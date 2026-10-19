SET local check_function_bodies = off;

CREATE TABLE "private"."comments" (
  "id"         bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "post_id"    bigint                   NOT NULL,
  "author_id"  uuid,
  "content"    text,
  "deleted_at" timestamp with time zone,
  "hidden_at"  timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "comments_pkey" PRIMARY KEY (id),
  CONSTRAINT "comments_content_check" CHECK (((content IS NULL) OR ((private.char_count(content) >= 1) AND (private.char_count(content) <= 30))))
);

ALTER TABLE "private"."comments"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."post_anon_numbers" (
  "post_id" bigint  NOT NULL,
  "user_id" uuid    NOT NULL,
  "number"  integer NOT NULL,
  CONSTRAINT "post_anon_numbers_number_check" CHECK ((number > 0)),
  CONSTRAINT "post_anon_numbers_pkey" PRIMARY KEY (post_id, user_id),
  CONSTRAINT "post_anon_numbers_post_id_number_key" UNIQUE (post_id, number)
);

ALTER TABLE "private"."post_anon_numbers"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."post_likes" (
  "id"         bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "post_id"    bigint                   NOT NULL,
  "user_id"    uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "post_likes_pkey" PRIMARY KEY (id),
  CONSTRAINT "post_likes_post_id_user_id_key" UNIQUE (post_id, user_id)
);

ALTER TABLE "private"."post_likes"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."post_products" (
  "post_id"   bigint   NOT NULL,
  "position"  smallint NOT NULL,
  "name"      text     NOT NULL,
  "brand"     text,
  "price"     integer,
  "url"       text     NOT NULL,
  "image_url" text,
  CONSTRAINT "post_products_pkey" PRIMARY KEY (post_id, "position"),
  CONSTRAINT "post_products_position_check" CHECK ((("position" >= 1) AND ("position" <= 4))),
  CONSTRAINT "post_products_price_check" CHECK ((price >= 0)),
  CONSTRAINT "post_products_url_check" CHECK ((url ~* '^https://'::text))
);

ALTER TABLE "private"."post_products"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."posts" (
  "id"               bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "author_id"        uuid                     NOT NULL,
  "content"          text                     NOT NULL,
  "ends_at"          timestamp with time zone,
  "deleted_at"       timestamp with time zone,
  "hidden_at"        timestamp with time zone,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "next_anon_number" integer                  NOT NULL DEFAULT 1,
  CONSTRAINT "posts_next_anon_number_check" CHECK ((next_anon_number > 0)),
  CONSTRAINT "posts_pkey" PRIMARY KEY (id),
  CONSTRAINT "posts_content_length"
    CHECK
    (((private.char_count(regexp_replace(content, '[[:space:]]'::text, ''::text, 'g'::text)) >= 5) AND (private.char_count(regexp_replace(content, '[[:space:]]'::text, ''::text,
    'g'::text)) <= 50)))
);

ALTER TABLE "private"."posts"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."reports" (
  "id"               bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "reporter_id"      uuid,
  "post_id"          bigint,
  "comment_id"       bigint,
  "reported_user_id" uuid,
  "detail"           text,
  "reported_content" text,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "reports_pkey" PRIMARY KEY (id),
  CONSTRAINT "reports_reporter_id_comment_id_key" UNIQUE (reporter_id, comment_id),
  CONSTRAINT "reports_reporter_id_post_id_key" UNIQUE (reporter_id, post_id),
  CONSTRAINT "reports_detail_check" CHECK (((detail IS NULL) OR (private.char_count(detail) <= 50)))
);

ALTER TABLE "private"."reports"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."user_blocks" (
  "blocker_id" uuid                     NOT NULL,
  "blocked_id" uuid                     NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "user_blocks_check" CHECK ((blocker_id <> blocked_id)),
  CONSTRAINT "user_blocks_pkey" PRIMARY KEY (blocker_id, blocked_id)
);

ALTER TABLE "private"."user_blocks"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."vote_responses" (
  "id"         bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "post_id"    bigint                   NOT NULL,
  "user_id"    uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "vote_responses_pkey" PRIMARY KEY (id),
  CONSTRAINT "vote_responses_post_id_user_id_key" UNIQUE (post_id, user_id)
);

ALTER TABLE "private"."vote_responses"
  ENABLE ROW LEVEL SECURITY;

CREATE TYPE "public"."post_type" AS ENUM (
  'post',
  'vote'
);

ALTER TABLE "private"."posts"
  ADD COLUMN "type" public.post_type NOT NULL;

CREATE TYPE "public"."report_reason" AS ENUM (
  'abuse',
  'spam',
  'inappropriate',
  'other'
);

ALTER TABLE "private"."reports"
  ADD COLUMN "reason" public.report_reason NOT NULL;

CREATE TYPE "public"."report_status" AS ENUM (
  'received',
  'reviewing',
  'resolved',
  'rejected'
);

ALTER TABLE "private"."reports"
  ADD COLUMN "status" public.report_status NOT NULL DEFAULT 'received'::public.report_status;

CREATE TYPE "public"."report_target" AS ENUM (
  'post',
  'comment'
);

ALTER TABLE "private"."reports"
  ADD COLUMN "target_type" public.report_target NOT NULL;

CREATE TYPE "public"."vote_choice" AS ENUM (
  'buy',
  'not'
);

ALTER TABLE "private"."vote_responses"
  ADD COLUMN "choice" public.vote_choice NOT NULL;

CREATE OR REPLACE FUNCTION private.assert_can_write_community()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  viewer_id uuid := (select auth.uid());
  profile public.profiles%rowtype;
begin
  if viewer_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select * into profile from public.profiles where id = viewer_id;
  if not found or profile.status = 'suspended' or
    (profile.status = 'community_restricted' and profile.restricted_until > now()) then
    raise exception 'community_restricted' using errcode = '42501';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION private.community_author_visible (
  target_author_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select not exists (
    select 1 from private.user_blocks b
    where b.blocker_id = (select auth.uid()) and b.blocked_id = target_author_id
  ) and not exists (
    select 1 from private.reports r
    where r.reporter_id = (select auth.uid()) and r.reported_user_id = target_author_id
  );
$function$;

CREATE OR REPLACE FUNCTION private.community_post_json (
  target_post_id bigint,
  is_preview     boolean
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select case when is_preview then jsonb_build_object(
    'id', p.id::text, 'type', p.type, 'created_at', p.created_at,
    'content', split_part(replace(p.content, E'\r', ''), E'\n', 1),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'position', i.position, 'image_url', i.image_url) order by i.position)
      from private.post_products i where i.post_id = p.id), '[]'::jsonb)
  ) else jsonb_build_object(
    'id', p.id::text, 'type', p.type, 'created_at', p.created_at, 'ends_at', p.ends_at,
    'server_now', now(), 'content', p.content, 'is_mine', p.author_id = (select auth.uid()),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'position', i.position, 'name', i.name, 'brand', i.brand, 'price', i.price,
      'url', i.url, 'image_url', i.image_url) order by i.position)
      from private.post_products i where i.post_id = p.id), '[]'::jsonb),
    'like_count', (select count(*) from private.post_likes l where l.post_id = p.id),
    'is_liked', exists(select 1 from private.post_likes l where l.post_id = p.id and l.user_id = (select auth.uid())),
    'comment_count', (select count(*) from private.comments c where c.post_id = p.id
      and c.deleted_at is null and c.hidden_at is null and private.community_author_visible(c.author_id)),
    'my_choice', (select v.choice from private.vote_responses v where v.post_id = p.id and v.user_id = (select auth.uid())),
    'buy_count', case when exists(select 1 from private.vote_responses v where v.post_id = p.id and v.user_id = (select auth.uid()))
      then (select count(*) from private.vote_responses v where v.post_id = p.id and v.choice = 'buy') else null end,
    'not_count', case when exists(select 1 from private.vote_responses v where v.post_id = p.id and v.user_id = (select auth.uid()))
      then (select count(*) from private.vote_responses v where v.post_id = p.id and v.choice = 'not') else null end
  ) end
  from private.posts p where p.id = target_post_id;
$function$;

CREATE OR REPLACE FUNCTION private.get_community_comments (
  target_post_id   bigint,
  after_created_at timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  after_id         bigint                   DEFAULT NULL::bigint
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if private.get_community_post(target_post_id) is null then return '[]'::jsonb; end if;
  if (after_created_at is null) <> (after_id is null) then
    raise exception 'invalid_comment_cursor' using errcode = '22023';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id::text, 'created_at', c.created_at,
      'content', case when c.author_id is null then null else c.content end,
      'is_post_author', c.author_id = p.author_id,
      'is_mine', c.author_id = (select auth.uid()), 'is_withdrawn', c.author_id is null,
      'anon_number', a.number
    ) order by c.created_at, c.id), '[]'::jsonb)
    from (
      select c.* from private.comments c
      where c.post_id = target_post_id and c.deleted_at is null and c.hidden_at is null
        and private.community_author_visible(c.author_id)
        and (after_created_at is null or (c.created_at, c.id) > (after_created_at, after_id))
      order by c.created_at, c.id limit 20
    ) c
    join private.posts p on p.id = c.post_id
    left join private.post_anon_numbers a on a.post_id = c.post_id and a.user_id = c.author_id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.get_community_feed (
  feed_type        text                     DEFAULT 'all'::text,
  after_created_at timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  after_id         bigint                   DEFAULT NULL::bigint
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  viewer_id uuid := (select auth.uid());
begin
  if feed_type not in ('all', 'vote') or feed_type is null or
    ((after_created_at is null) <> (after_id is null)) then
    raise exception 'invalid_feed_cursor' using errcode = '22023';
  end if;
  if viewer_id is not null and not exists (
    select 1 from public.profiles where id = viewer_id and status <> 'suspended'
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(private.community_post_json(p.id, viewer_id is null)
      order by p.created_at desc, p.id desc), '[]'::jsonb)
    from (
      select p.id, p.created_at from private.posts p
      where p.deleted_at is null and p.hidden_at is null
        and (feed_type = 'all' or p.type = 'vote')
        and private.community_author_visible(p.author_id)
        and (after_created_at is null or (p.created_at, p.id) < (after_created_at, after_id))
      order by p.created_at desc, p.id desc limit 20
    ) p
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.get_community_post (
  target_post_id bigint
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.profiles where id = (select auth.uid()) and status <> 'suspended'
  ) then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return (
    select private.community_post_json(p.id, false) from private.posts p
    where p.id = target_post_id and p.deleted_at is null and p.hidden_at is null
      and private.community_author_visible(p.author_id)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_community_comments (
  target_post_id   bigint,
  after_created_at timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  after_id         bigint                   DEFAULT NULL::bigint
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.get_community_comments(target_post_id, after_created_at, after_id);
$function$;

REVOKE ALL ON FUNCTION "public"."get_community_comments"(bigint, timestamp WITH time zone, bigint) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.get_community_feed (
  feed_type        text                     DEFAULT 'all'::text,
  after_created_at timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  after_id         bigint                   DEFAULT NULL::bigint
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.get_community_feed(feed_type, after_created_at, after_id);
$function$;

CREATE OR REPLACE FUNCTION public.get_community_post (
  target_post_id bigint
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.get_community_post(target_post_id);
$function$;

REVOKE ALL ON FUNCTION "public"."get_community_post"(bigint) FROM PUBLIC, "anon";

ALTER TABLE "private"."comments"
  ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE "private"."post_anon_numbers"
  ADD CONSTRAINT "post_anon_numbers_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "private"."post_likes"
  ADD CONSTRAINT "post_likes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE "private"."posts"
  ADD CONSTRAINT "posts_author_id_fkey" FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "private"."comments"
  ADD CONSTRAINT "comments_post_id_fkey" FOREIGN KEY (post_id) REFERENCES private.posts(id) ON DELETE CASCADE;

ALTER TABLE "private"."post_anon_numbers"
  ADD CONSTRAINT "post_anon_numbers_post_id_fkey" FOREIGN KEY (post_id) REFERENCES private.posts(id) ON DELETE CASCADE;

ALTER TABLE "private"."post_likes"
  ADD CONSTRAINT "post_likes_post_id_fkey" FOREIGN KEY (post_id) REFERENCES private.posts(id) ON DELETE CASCADE;

ALTER TABLE "private"."post_products"
  ADD CONSTRAINT "post_products_post_id_fkey" FOREIGN KEY (post_id) REFERENCES private.posts(id) ON DELETE CASCADE;

ALTER TABLE "private"."posts"
  ADD CONSTRAINT "posts_vote_end" CHECK ((((type = 'post'::public.post_type) AND (ends_at IS NULL)) OR ((type = 'vote'::public.post_type) AND (ends_at IS
    NOT NULL) AND (ends_at = (created_at + '24:00:00'::interval)))));

ALTER TABLE "private"."reports"
  ADD CONSTRAINT "reports_check1" CHECK (((reason = 'other'::public.report_reason) OR (detail IS NULL)));

ALTER TABLE "private"."reports"
  ADD CONSTRAINT "reports_check" CHECK ((((target_type = 'post'::public.report_target) AND (post_id IS
    NOT NULL) AND (comment_id IS NULL)) OR ((target_type = 'comment'::public.report_target) AND (comment_id IS NOT NULL) AND (post_id IS NULL))));

ALTER TABLE "private"."reports"
  ADD CONSTRAINT "reports_comment_id_fkey" FOREIGN KEY (comment_id) REFERENCES private.comments(id) ON DELETE CASCADE;

ALTER TABLE "private"."reports"
  ADD CONSTRAINT "reports_post_id_fkey" FOREIGN KEY (post_id) REFERENCES private.posts(id) ON DELETE CASCADE;

ALTER TABLE "private"."reports"
  ADD CONSTRAINT "reports_reported_user_id_fkey" FOREIGN KEY (reported_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE "private"."reports"
  ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY (reporter_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE "private"."user_blocks"
  ADD CONSTRAINT "user_blocks_blocked_id_fkey" FOREIGN KEY (blocked_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "private"."user_blocks"
  ADD CONSTRAINT "user_blocks_blocker_id_fkey" FOREIGN KEY (blocker_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "private"."vote_responses"
  ADD CONSTRAINT "vote_responses_post_id_fkey" FOREIGN KEY (post_id) REFERENCES private.posts(id) ON DELETE CASCADE;

ALTER TABLE "private"."vote_responses"
  ADD CONSTRAINT "vote_responses_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX comments_author_idx ON private.comments USING btree (author_id);

CREATE INDEX comments_post_idx ON private.comments USING btree (post_id, created_at, id)
  WHERE ((deleted_at IS NULL) AND (hidden_at IS NULL));

CREATE INDEX post_anon_numbers_user_idx ON private.post_anon_numbers USING btree (user_id);

CREATE INDEX post_likes_user_idx ON private.post_likes USING btree (user_id, created_at DESC);

CREATE INDEX posts_author_idx ON private.posts USING btree (author_id, created_at DESC, id DESC);

CREATE INDEX posts_feed_idx ON private.posts USING btree (created_at DESC, id DESC)
  WHERE ((deleted_at IS NULL) AND (hidden_at IS NULL));

CREATE INDEX posts_vote_feed_idx ON private.posts USING btree (created_at DESC, id DESC)
  WHERE ((TYPE = 'vote'::public.post_type) AND (deleted_at IS NULL) AND (hidden_at IS NULL));

CREATE INDEX reports_author_idx ON private.reports USING btree (reporter_id, reported_user_id);

CREATE INDEX reports_comment_idx ON private.reports USING btree (comment_id);

CREATE INDEX reports_post_idx ON private.reports USING btree (post_id);

CREATE INDEX reports_reported_user_idx ON private.reports USING btree (reported_user_id);

CREATE INDEX user_blocks_blocked_idx ON private.user_blocks USING btree (blocked_id);

CREATE INDEX vote_responses_user_idx ON private.vote_responses USING btree (user_id);

REVOKE ALL ON FUNCTION "private"."assert_can_write_community"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."community_author_visible"(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."community_post_json"(bigint, boolean) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."get_community_comments"(bigint, timestamp WITH time zone, bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."get_community_comments"(bigint, timestamp WITH time zone, bigint) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."get_community_feed"(text, timestamp WITH time zone, bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."get_community_feed"(text, timestamp WITH time zone, bigint) TO "anon", "authenticated";

REVOKE ALL ON FUNCTION "private"."get_community_post"(bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."get_community_post"(bigint) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_community_comments"(bigint, timestamp WITH time zone, bigint) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."get_community_comments"(bigint, timestamp WITH time zone, bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_community_comments"(bigint, timestamp WITH time zone, bigint) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_community_comments"(bigint, timestamp WITH time zone, bigint) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_community_feed"(text, timestamp WITH time zone, bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."get_community_feed"(text, timestamp WITH time zone, bigint) TO "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."get_community_feed"(text, timestamp WITH time zone, bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_community_feed"(text, timestamp WITH time zone, bigint) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_community_feed"(text, timestamp WITH time zone, bigint) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."get_community_post"(bigint) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."get_community_post"(bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_community_post"(bigint) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_community_post"(bigint) TO "service_role";

REVOKE ALL ON SCHEMA "private" FROM "anon";

GRANT USAGE ON SCHEMA "private" TO "anon";
