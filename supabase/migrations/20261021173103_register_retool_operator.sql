-- #115: 사용자가 확인한 Retool 운영 계정만 일반 운영자로 등록한다.
-- #121은 승인 검사에서 배포가 중단됐다. 승인된 후속 PR 배포에서 이 미적용 파일을 적용한다.
-- 로컬/CI에는 실제 Auth 계정이 없으므로 등록하지 않는다.
-- 이메일은 Auth에서 가져오고, 기존 권한이나 비활성화 상태는 변경하지 않는다.
insert into private.admin_users (id, email, role)
select id, email, 'operator'
from auth.users
where id = '2d156904-38dc-412c-88eb-7a0cc5419e6d'::uuid
  and email is not null
  and email_confirmed_at is not null
on conflict (id) do nothing;
