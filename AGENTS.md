# Project instructions

- Before starting any task in this repository, read `CONVENTION.md` and follow its conventions throughout the work.
- When creating commits, keep the configured commit template and follow the commit format in `CONVENTION.md`.
- When creating or updating a pull request, preserve the structure of `.github/PULL_REQUEST_TEMPLATE.md` and complete every applicable section.

## Database Rules

DB 관련 작업을 수행하기 전에
`docs/DB_RULES.md`를 반드시 읽고 준수한다.

- DB 스키마 변경
- 마이그레이션 생성 및 검증
- RLS 및 보안 정책 수정
- Supabase 관련 작업

위 작업에서는 DB_RULES.md를 공통 기준으로 따른다.

테이블·RPC를 설계하거나 추가할 때는 `docs/DB_SCHEMA.md`도 함께 읽는다.
최종 스키마, 구현 패턴(public/private 구분, RPC 래퍼, 권한, 글자 수 함수, 테스트 방식),
확정 정책과 남은 확인 사항이 정리되어 있다.
설계를 바꾸면 `supabase/schemas/`와 `docs/DB_SCHEMA.md`를 같은 PR에서 함께 수정한다.
