create type public.account_status as enum ('active', 'warning', 'community_restricted', 'suspended');

create type public.folder_kind as enum ('custom', 'owned');

create type public.wish_level as enum ('high', 'medium', 'low');

create type public.post_type as enum ('post', 'vote');
create type public.vote_choice as enum ('buy', 'not');
create type public.report_target as enum ('post', 'comment');
create type public.report_reason as enum ('abuse', 'spam', 'inappropriate', 'other');
create type public.report_status as enum ('received', 'reviewing', 'resolved', 'rejected');
create type public.notification_type as enum ('vote_ended', 'post_commented', 'post_liked');

create type public.import_status as enum ('processing', 'completed', 'failed');

create type public.import_fail_reason as enum (
  'EMPTY_PRODUCT_NAME', 'EMPTY_PRODUCT_URL', 'INVALID_PRODUCT_URL', 'CSV_ROW_PARSE_ERROR',
  'INVALID_PRODUCT_DATA', 'FOLDER_LIMIT_EXCEEDED', 'FOLDER_SAVE_FAILED'
);

create type public.withdrawal_reason as enum (
  'rarely_used',
  'missing_feature',
  'other_service',
  'hard_to_use',
  'frequent_error'
);
