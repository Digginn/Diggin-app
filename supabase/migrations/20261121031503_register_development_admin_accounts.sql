-- #224: 사용자가 지정한 개발 관리자 2명. 운영 계정과 별도로 Auth Admin API로 생성했다.
-- 개발 프로젝트에서 확인한 UUID·이메일·확인 완료·비밀번호 설정을 모두 만족할 때만 등록한다.
-- 운영/로컬/CI에는 이 개발 UUID가 없으므로 건너뛴다. 기존 권한·비활성화 상태는 보존한다.
insert into private.admin_users (id, email, role)
select u.id, u.email, 'operator'
from auth.users u
join (values
  ('25230b16-95fa-469c-86ef-35ed8cda0f3f'::uuid, 'diggin.app@gmail.com'),
  ('36ff500f-f715-4c06-9dba-904edda79f1c'::uuid, 'digginmanagertest@gmail.com')
) approved(id, email) on approved.id = u.id and approved.email = u.email
where u.email_confirmed_at is not null
  and coalesce(u.encrypted_password, '') <> ''
on conflict (id) do nothing;
