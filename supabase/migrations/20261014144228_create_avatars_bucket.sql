-- 버킷은 storage.buckets의 행이라 선언형 스키마로 표현되지 않는다(DB_RULES 2.2 예외).
-- MY-003 클라이언트가 512×512 WebP(약 100KB)로 줄여 올린다. 여유를 두고 512KB까지 받는다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 524288, array['image/webp'])
on conflict (id) do nothing;
