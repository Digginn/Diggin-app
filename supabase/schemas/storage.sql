-- MY-003 프로필 이미지는 avatars/{user_id}/ 아래에 본인만 올리고 읽는다. 커뮤니티가 익명이라 남에게 보일 일이 없다.
-- 교체 업로드(upsert)는 insert·select·update가 모두 필요하다.
create policy "avatars_select_own"
on storage.objects
for select
to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars_insert_own"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars_update_own"
on storage.objects
for update
to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars_delete_own"
on storage.objects
for delete
to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
