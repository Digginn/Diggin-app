create table public.folders (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind public.folder_kind not null default 'custom',
  name text not null,
  created_at timestamptz not null default now(),
  last_added_at timestamptz,
  constraint folders_id_user_id_key unique (id, user_id),
  -- 같은 이름이 둘이면 폴더 선택 시트에서 구분할 수 없다. 나의 소장템 이름도 포함한다.
  constraint folders_user_id_name_key unique (user_id, name),
  constraint folders_name_length check (kind = 'owned' or private.char_count(name) between 1 and 7)
);

create unique index folders_one_owned_per_user on public.folders (user_id) where kind = 'owned';

create or replace function private.normalize_folder_name()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := normalize(btrim(new.name), NFC);
  return new;
end;
$$;

create trigger folders_normalize_name
before insert or update of name on public.folders
for each row execute function private.normalize_folder_name();

-- FLD-008 사용자 생성 폴더 최대 50개. 동시에 만들어도 넘지 않도록 프로필 행을 잠근 뒤 센다.
create or replace function private.enforce_folder_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'custom' then
    perform 1 from public.profiles where id = new.user_id for update;
    if (select count(*) from public.folders where user_id = new.user_id and kind = 'custom') >= 50 then
      raise exception 'folder_limit_reached' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger folders_enforce_limit
before insert on public.folders
for each row execute function private.enforce_folder_limit();

revoke execute on function private.normalize_folder_name() from public, anon, authenticated;
revoke execute on function private.enforce_folder_limit() from public, anon, authenticated;

alter table public.folders enable row level security;

revoke all on table public.folders from anon, authenticated;
grant select, delete on table public.folders to authenticated;
grant insert (name), update (name) on table public.folders to authenticated;

create policy "folders_select_own"
on public.folders
for select
to authenticated
using ((select auth.uid()) = user_id);

-- FLD-006 나의 소장템은 사용자가 만들거나 고치거나 지울 수 없다.
create policy "folders_insert_own_custom"
on public.folders
for insert
to authenticated
with check ((select auth.uid()) = user_id and kind = 'custom');

create policy "folders_update_own_custom"
on public.folders
for update
to authenticated
using ((select auth.uid()) = user_id and kind = 'custom')
with check ((select auth.uid()) = user_id and kind = 'custom');

create policy "folders_delete_own_custom"
on public.folders
for delete
to authenticated
using ((select auth.uid()) = user_id and kind = 'custom');
