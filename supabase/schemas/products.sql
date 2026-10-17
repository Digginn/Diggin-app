create table public.products (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  url text not null,
  name text not null,
  brand text,
  -- null은 가격 정보 없음, 0은 사용자가 직접 입력한 0원(SAVE-005).
  price integer,
  -- null이면 Placeholder. 저장 뒤에는 바꿀 수 없다(PDT-006).
  image_url text,
  -- 나의 소장템에 든 상품은 null이다(PDT-008).
  wish_level public.wish_level,
  -- CSV로 가져온 상품은 원래 등록일을 넣는다.
  saved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_id_user_id_key unique (id, user_id),
  constraint products_user_id_url_key unique (user_id, url),
  constraint products_url_https check (url ~* '^https://'),
  -- 상품명·브랜드는 명세가 NFC 정규화 후 문자 수라 char_length로 센다.
  constraint products_name_length check (char_length(name) between 1 and 100),
  constraint products_brand_length check (char_length(brand) between 1 and 30),
  constraint products_price_non_negative check (price >= 0)
);

create index products_user_id_saved_at_idx on public.products (user_id, saved_at desc, id desc);

create table public.product_folders (
  product_id bigint not null,
  folder_id bigint not null,
  user_id uuid not null default auth.uid(),
  -- FLD-001 최근 담은 순, PDT-008 소장 처리 시각으로 쓴다.
  created_at timestamptz not null default now(),
  primary key (product_id, folder_id),
  -- 본인 상품을 본인 폴더에만 담을 수 있게 소유자까지 묶는다.
  constraint product_folders_product_fkey foreign key (product_id, user_id)
    references public.products (id, user_id) on delete cascade,
  constraint product_folders_folder_fkey foreign key (folder_id, user_id)
    references public.folders (id, user_id) on delete cascade
);

create index product_folders_folder_id_created_at_idx
on public.product_folders (folder_id, created_at desc);
create index product_folders_user_id_idx on public.product_folders (user_id);

create trigger products_set_updated_at
before update on public.products
for each row execute function private.set_updated_at();

create or replace function private.normalize_product()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.url := btrim(new.url);
  new.name := normalize(btrim(new.name), NFC);
  new.brand := nullif(normalize(btrim(new.brand), NFC), '');
  return new;
end;
$$;

create trigger products_normalize
before insert or update of url, name, brand on public.products
for each row execute function private.normalize_product();

-- 저장(save_product)과 CSV 가져오기가 같은 기준으로 검사하도록 한곳에 둔다.
-- 상품명·브랜드는 정규화한 값으로 센다. 넘으면 직접 입력은 거부하고, 자동 추출·CSV는 호출하는 쪽에서 상한까지 잘라 넘긴다.
create or replace function private.product_input_error(
  product_url text,
  product_name text,
  product_brand text,
  product_price integer
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
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
$$;

-- FLD-001 상품을 담은 시각만 순서를 바꾼다. 빼거나 지워도 되돌리지 않는다.
create or replace function private.touch_folder_last_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.folders set last_added_at = new.created_at where id = new.folder_id;
  return new;
end;
$$;

create trigger product_folders_touch_folder
after insert on public.product_folders
for each row execute function private.touch_folder_last_added();

-- PDT-008 나의 소장템에 든 상품은 위시레벨이 없다. 소장 처리는 set_owned가 위시레벨을 먼저 비운다.
create or replace function private.reject_owned_product_wish_level()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

create trigger products_reject_owned_wish_level
before update of wish_level on public.products
for each row
when (new.wish_level is not null)
execute function private.reject_owned_product_wish_level();

create or replace function private.reject_wish_level_in_owned_folder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

create trigger product_folders_reject_owned_wish_level
before insert on public.product_folders
for each row execute function private.reject_wish_level_in_owned_folder();

create or replace function private.save_product(
  product_url text,
  product_name text,
  product_brand text default null,
  product_price integer default null,
  product_image_url text default null,
  product_wish_level public.wish_level default null,
  folder_ids bigint[] default null
)
returns table (product_id bigint, is_duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

create or replace function private.set_owned(
  target_product_id bigint,
  is_owned boolean,
  keep_other_folders boolean default true,
  new_wish_level public.wish_level default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
    -- 해제할 때 위시레벨을 고르지 않으면 미선택(null)으로 둔다. 저장할 때 미선택을 허용하는 것(SAVE-011)과 같다.
    delete from public.product_folders
    where product_id = target_product_id and folder_id = owned_folder_id;
    update public.products set wish_level = new_wish_level where id = target_product_id;
  end if;
end;
$$;

create or replace function public.save_product(
  product_url text,
  product_name text,
  product_brand text default null,
  product_price integer default null,
  product_image_url text default null,
  product_wish_level public.wish_level default null,
  folder_ids bigint[] default null
)
returns table (product_id bigint, is_duplicate boolean)
language sql
security invoker
set search_path = ''
as $$
  select * from private.save_product(
    product_url,
    product_name,
    product_brand,
    product_price,
    product_image_url,
    product_wish_level,
    folder_ids
  );
$$;

create or replace function public.set_owned(
  target_product_id bigint,
  is_owned boolean,
  keep_other_folders boolean default true,
  new_wish_level public.wish_level default null
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.set_owned(target_product_id, is_owned, keep_other_folders, new_wish_level);
$$;

revoke execute on function private.normalize_product() from public, anon, authenticated;
revoke execute on function private.touch_folder_last_added() from public, anon, authenticated;
revoke execute on function private.reject_owned_product_wish_level() from public, anon, authenticated;
revoke execute on function private.reject_wish_level_in_owned_folder() from public, anon, authenticated;
revoke execute on function private.product_input_error(text, text, text, integer) from public, anon, authenticated;
revoke execute on function private.save_product(text, text, text, integer, text, public.wish_level, bigint[]) from public, anon;
revoke execute on function private.set_owned(bigint, boolean, boolean, public.wish_level) from public, anon;
grant execute on function private.save_product(text, text, text, integer, text, public.wish_level, bigint[]) to authenticated;
grant execute on function private.set_owned(bigint, boolean, boolean, public.wish_level) to authenticated;

revoke execute on function public.save_product(text, text, text, integer, text, public.wish_level, bigint[]) from public, anon;
revoke execute on function public.set_owned(bigint, boolean, boolean, public.wish_level) from public, anon;
grant execute on function public.save_product(text, text, text, integer, text, public.wish_level, bigint[]) to authenticated;
grant execute on function public.set_owned(bigint, boolean, boolean, public.wish_level) to authenticated;

alter table public.products enable row level security;
alter table public.product_folders enable row level security;

revoke all on table public.products from anon, authenticated;
grant select, delete on table public.products to authenticated;
grant update (name, brand, price, wish_level) on table public.products to authenticated;

-- 일반 폴더 담기·빼기만 앱이 직접 한다. 나의 소장템은 set_owned로만 바꾼다.
revoke all on table public.product_folders from anon, authenticated;
grant select, delete on table public.product_folders to authenticated;
grant insert (product_id, folder_id) on table public.product_folders to authenticated;

create policy "products_select_own"
on public.products
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "products_update_own"
on public.products
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "products_delete_own"
on public.products
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "product_folders_select_own"
on public.product_folders
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "product_folders_insert_own_custom"
on public.product_folders
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.folders f
    where f.id = folder_id and f.user_id = (select auth.uid()) and f.kind = 'custom'
  )
);

create policy "product_folders_delete_own_custom"
on public.product_folders
for delete
to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.folders f
    where f.id = folder_id and f.user_id = (select auth.uid()) and f.kind = 'custom'
  )
);
