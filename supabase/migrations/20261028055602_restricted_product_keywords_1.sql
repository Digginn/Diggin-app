SET local check_function_bodies = off;

DROP TRIGGER "products_normalize" ON "public"."products";

DROP FUNCTION "private"."save_product"(text, text, text, integer, text, public.wish_level, bigint[]);

DROP FUNCTION "public"."save_product"(text, text, text, integer, text, public.wish_level, bigint[]);

ALTER TABLE "public"."products"
  ADD COLUMN "restriction_labels" text[] NOT NULL DEFAULT '{}'::text[];

ALTER TYPE "public"."import_fail_reason" ADD VALUE 'RESTRICTED_PRODUCT' BEFORE 'FOLDER_LIMIT_EXCEEDED';
