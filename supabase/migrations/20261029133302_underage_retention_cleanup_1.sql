SET local check_function_bodies = off;

CREATE TABLE "private"."admin_access_logs" (
  "id"         bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "admin_id"   uuid                     NOT NULL,
  "report_id"  bigint                   NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "admin_access_logs_pkey" PRIMARY KEY (id)
);

ALTER TABLE "private"."admin_access_logs"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."apple_refresh_tokens" (
  "user_id"    uuid                     NOT NULL,
  "secret_id"  uuid                     NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "apple_refresh_tokens_pkey" PRIMARY KEY (user_id),
  CONSTRAINT "apple_refresh_tokens_secret_id_key" UNIQUE (secret_id)
);

ALTER TABLE "private"."apple_refresh_tokens"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."retention_holds" (
  "target_type" text                     NOT NULL,
  "target_id"   bigint                   NOT NULL,
  "admin_id"    uuid                     NOT NULL,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "retention_holds_pkey" PRIMARY KEY (target_type, target_id),
  CONSTRAINT "retention_holds_target_type_check" CHECK ((target_type = ANY (ARRAY['report'::text, 'sanction'::text])))
);

ALTER TABLE "private"."retention_holds"
  ENABLE ROW LEVEL SECURITY;

ALTER TYPE "public"."report_reason" ADD VALUE 'underage' AFTER 'other';

