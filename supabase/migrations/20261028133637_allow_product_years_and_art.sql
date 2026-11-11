SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.is_restricted_product (
  product_name text,
  labels       text[] DEFAULT '{}'::text[]
)
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
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
$function$;
