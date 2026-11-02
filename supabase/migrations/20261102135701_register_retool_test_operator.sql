-- #175: 사용자가 확인한 Retool 전용 테스트 계정을 operator로 등록한다.
-- 로컬/CI에서는 계정이 없으면 건너뛰며 기존 권한·비활성화 상태는 보존한다.
insert into private.admin_users (id, email, role)
select id, email, 'operator'
from auth.users
where id = '95fece6b-9373-430b-8547-61eef81903e1'::uuid
  and email = 'digginmanagertest@gmail.com'
  and email_confirmed_at is not null
on conflict (id) do nothing;
