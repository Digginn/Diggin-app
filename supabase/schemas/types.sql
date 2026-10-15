create type public.account_status as enum ('active', 'warning', 'community_restricted', 'suspended');

create type public.folder_kind as enum ('custom', 'owned');

create type public.withdrawal_reason as enum (
  'rarely_used',
  'missing_feature',
  'other_service',
  'hard_to_use',
  'frequent_error'
);
