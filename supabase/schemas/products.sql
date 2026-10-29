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
  -- 추출된 카테고리·연령 표시. 상품명 수정으로 원래 제한 표시를 지우지 않는다.
  restriction_labels text[] not null default '{}',
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

create or replace function private.is_restricted_product(product_name text, labels text[] default '{}')
returns boolean language sql immutable set search_path = '' as $$
  select exists (
    select 1
    from unnest(array[coalesce(product_name, '')] || coalesce(labels, '{}')) as source(value)
    cross join unnest(array[
      '성인','19금','19세','19+','18+','성인인증','청소년유해','청소년 구매불가','미성년자 구매불가',
      '주류','소주','맥주','와인','위스키','보드카','막걸리','사케','리큐르','칵테일',
      '담배','전자담배','니코틴','궐련','시가','vape','cigarette',
      '성인용품','섹스토이','섹스 토이','딜도','바이브레이터','자위기구','애널플러그',
      '성인영상','성인만화','성인잡지','adult','sex toy'
    ]) as keyword(value)
    where strpos(
      regexp_replace(lower(normalize(source.value, NFKC)), '[[:space:]]+', '', 'g'),
      regexp_replace(lower(normalize(keyword.value, NFKC)), '[[:space:]]+', '', 'g')
    ) > 0
  );
$$;

create or replace function private.normalize_product()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.url := btrim(new.url);
  new.name := normalize(btrim(new.name), NFC);
  new.brand := nullif(normalize(btrim(new.brand), NFC), '');
  if private.is_restricted_product(new.name, new.restriction_labels) then
    raise exception 'restricted_product' using errcode = '22023';
  end if;
  -- 원문 전체를 검사한 뒤에만 저장 크기를 줄여 뒤쪽의 제한 키워드를 놓치지 않는다.
  new.restriction_labels := array(
    select left(normalize(btrim(label), NFC), 100)
    from unnest(new.restriction_labels) with ordinality as source(label, position)
    where btrim(label) <> ''
    order by position
    limit 10
  );
  return new;
end;
$$;

create trigger products_normalize
before insert or update of url, name, brand, restriction_labels on public.products
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
  if private.is_restricted_product(clean_name) then
    return 'restricted_product';
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
  folder_ids bigint[] default null,
  product_restriction_labels text[] default '{}'
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
  perform private.assert_account_access();
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  input_error := private.product_input_error(product_url, product_name, product_brand, product_price);
  if private.is_restricted_product(product_name, product_restriction_labels) then
    input_error := 'restricted_product';
  end if;
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

  insert into public.products (user_id, url, name, brand, price, image_url, wish_level, restriction_labels)
  values (
    current_user_id,
    product_url,
    product_name,
    product_brand,
    product_price,
    product_image_url,
    case when is_owned then null else product_wish_level end,
    coalesce(product_restriction_labels, '{}')
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
  perform private.assert_account_access();
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
  folder_ids bigint[] default null,
  product_restriction_labels text[] default '{}'
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
    folder_ids,
    product_restriction_labels
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

-- PDT-003·008 폴더 관리 시트의 최종 선택을 한 트랜잭션으로 반영한다. 앱은 이전 상태를 들고 계산하지 않고
-- 최종 폴더 목록만 넘긴다. 상품 행을 잠가 같은 상품을 동시에 저장해도 차례로 처리된다.
create or replace function private.set_product_folders(
  target_product_id bigint,
  folder_ids bigint[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  selected bigint[] := coalesce(folder_ids, '{}');
  owned_folder_id bigint;
  is_owned boolean;
begin
  perform private.assert_account_access();
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  perform 1 from public.products
  where id = target_product_id and user_id = current_user_id
  for update;
  if not found then
    raise exception 'product_not_found' using errcode = '22023';
  end if;

  -- 남의 폴더나 없는 폴더가 섞이면 아무것도 바꾸지 않는다.
  if exists (
    select 1 from unnest(selected) as picked(id)
    where not exists (
      select 1 from public.folders f where f.id = picked.id and f.user_id = current_user_id
    )
  ) then
    raise exception 'folder_not_found' using errcode = '22023';
  end if;

  select id into owned_folder_id
  from public.folders
  where user_id = current_user_id and kind = 'owned';

  select exists (
    select 1 from public.product_folders
    where product_id = target_product_id and folder_id = owned_folder_id
  ) into is_owned;

  -- 나의 소장템은 위시레벨 규칙이 있어 set_owned로만 넣고 뺀다.
  if (owned_folder_id = any(selected)) is distinct from is_owned then
    perform private.set_owned(target_product_id, owned_folder_id = any(selected));
  end if;

  delete from public.product_folders pf
  using public.folders f
  where pf.product_id = target_product_id
    and f.id = pf.folder_id
    and f.kind = 'custom'
    and not (pf.folder_id = any(selected));

  insert into public.product_folders (product_id, folder_id, user_id)
  select target_product_id, f.id, current_user_id
  from public.folders f
  where f.user_id = current_user_id and f.kind = 'custom' and f.id = any(selected)
  on conflict do nothing;
end;
$$;

create or replace function public.set_product_folders(
  target_product_id bigint,
  folder_ids bigint[]
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.set_product_folders(target_product_id, folder_ids);
$$;

revoke execute on function private.normalize_product() from public, anon, authenticated;
revoke execute on function private.is_restricted_product(text, text[]) from public, anon;
grant execute on function private.is_restricted_product(text, text[]) to authenticated;
revoke execute on function private.touch_folder_last_added() from public, anon, authenticated;
revoke execute on function private.reject_owned_product_wish_level() from public, anon, authenticated;
revoke execute on function private.reject_wish_level_in_owned_folder() from public, anon, authenticated;
revoke execute on function private.product_input_error(text, text, text, integer) from public, anon, authenticated;
revoke execute on function private.save_product(text, text, text, integer, text, public.wish_level, bigint[], text[]) from public, anon;
revoke execute on function private.set_owned(bigint, boolean, boolean, public.wish_level) from public, anon;
revoke execute on function private.set_product_folders(bigint, bigint[]) from public, anon;
grant execute on function private.set_product_folders(bigint, bigint[]) to authenticated;
grant execute on function private.save_product(text, text, text, integer, text, public.wish_level, bigint[], text[]) to authenticated;
grant execute on function private.set_owned(bigint, boolean, boolean, public.wish_level) to authenticated;

revoke execute on function public.save_product(text, text, text, integer, text, public.wish_level, bigint[], text[]) from public, anon;
revoke execute on function public.set_owned(bigint, boolean, boolean, public.wish_level) from public, anon;
revoke execute on function public.set_product_folders(bigint, bigint[]) from public, anon;
grant execute on function public.set_product_folders(bigint, bigint[]) to authenticated;
grant execute on function public.save_product(text, text, text, integer, text, public.wish_level, bigint[], text[]) to authenticated;
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
