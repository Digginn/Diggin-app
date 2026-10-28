SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.normalize_product()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
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
$function$;
