create table private.first_visit_guides (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  guide_kind text not null check (guide_kind in ('all', 'folder', 'item-detail')),
  dismissed_at timestamptz not null default now(),
  unique (user_id, guide_kind)
);

alter table private.first_visit_guides enable row level security;
revoke all on table private.first_visit_guides from public, anon, authenticated;
revoke all on sequence private.first_visit_guides_id_seq from public, anon, authenticated;

create or replace function private.get_first_visit_guides(target_user_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
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
$$;

create or replace function private.dismiss_first_visit_guide(target_user_id uuid, target_guide_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

create or replace function public.get_first_visit_guides(target_user_id uuid)
returns text[]
language sql
security invoker
set search_path = ''
as $$
  select private.get_first_visit_guides(target_user_id);
$$;

create or replace function public.dismiss_first_visit_guide(target_user_id uuid, target_guide_kind text)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.dismiss_first_visit_guide(target_user_id, target_guide_kind);
$$;

revoke execute on function private.get_first_visit_guides(uuid),
  private.dismiss_first_visit_guide(uuid, text), public.get_first_visit_guides(uuid),
  public.dismiss_first_visit_guide(uuid, text) from public, anon;
grant execute on function private.get_first_visit_guides(uuid),
  private.dismiss_first_visit_guide(uuid, text), public.get_first_visit_guides(uuid),
  public.dismiss_first_visit_guide(uuid, text) to authenticated;
