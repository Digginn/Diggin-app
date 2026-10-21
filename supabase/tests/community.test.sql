begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

insert into auth.users(id, email) values
 ('94000000-0000-0000-0000-000000000001','community-a@test.dev'),
 ('94000000-0000-0000-0000-000000000002','community-b@test.dev'),
 ('94000000-0000-0000-0000-000000000003','community-c@test.dev');
insert into private.posts(author_id,type,content,created_at)
 select '94000000-0000-0000-0000-000000000001','post',E'첫번째 줄입니다\n두번째 줄입니다','2026-01-01'::timestamptz
 from generate_series(1,25);
select set_config('test.post', (select min(id)::text from private.posts), true);
insert into private.posts(author_id,type,content,created_at,ends_at)
 values ('94000000-0000-0000-0000-000000000002','vote','투표 상품입니다','2026-01-02','2026-01-03');
select set_config('test.vote', (select max(id)::text from private.posts), true);
insert into private.post_products(post_id,position,name,brand,price,url,image_url)
 select id,1,'게시 시점 상품','브랜드',0,'https://shop.test/snapshot','https://shop.test/image.png' from private.posts;
insert into private.posts(author_id,type,content,hidden_at)
 values ('94000000-0000-0000-0000-000000000003','post','숨긴 게시글입니다',now());
select set_config('test.hidden', (select max(id)::text from private.posts), true);
insert into private.posts(author_id,type,content,deleted_at)
 values ('94000000-0000-0000-0000-000000000003','post','삭제 게시글입니다',now());
select set_config('test.deleted', (select max(id)::text from private.posts), true);
insert into private.comments(post_id,author_id,content)
 values (current_setting('test.post')::bigint,'94000000-0000-0000-0000-000000000001','글쓴이 댓글'),
 (current_setting('test.post')::bigint,'94000000-0000-0000-0000-000000000002',E'다른 사람\n댓글'),
 (current_setting('test.post')::bigint,null,'원래 댓글 내용');
insert into private.post_anon_numbers(post_id,user_id,number)
 values (current_setting('test.post')::bigint,'94000000-0000-0000-0000-000000000002',1);

set local role anon;
select is(jsonb_array_length(public.get_community_feed()),20,'비회원도 20개 단위 미리보기를 읽는다');
select is(public.get_community_feed()->0->>'content','투표 상품입니다','피드는 최신순이다');
select ok(not (public.get_community_feed()->0 ? 'is_mine'),'비회원에게 회원 상세 필드를 주지 않는다');
select ok(not (public.get_community_feed()->0->'items'->0 ? 'url'),'비회원에게 상품 URL을 주지 않는다');
select ok(not (public.get_community_feed()->1->>'content' like '%' || E'\n' || '%'),'비회원 본문은 첫 줄만 반환한다');
select throws_ok($$select public.get_community_post(current_setting('test.post')::bigint)$$,'42501',null,'비회원 상세 RPC 차단');
select throws_ok($$select * from private.posts$$,'42501',null,'비회원 원본 글 직접 조회 차단');
select throws_ok($$select private.community_post_json(current_setting('test.post')::bigint,false)$$,'42501',null,'비회원 내부 직렬화 함수 호출 차단');
reset role;
set local role authenticated;
select throws_ok($$select public.get_community_post(current_setting('test.post')::bigint)$$,'42501','not_authenticated','JWT 없이 상세 조회 차단');
set local request.jwt.claims = '{"sub":"94000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(public.get_community_post(current_setting('test.post')::bigint)->>'is_mine','true','본인 여부만 반환한다');
select ok(not (public.get_community_post(current_setting('test.post')::bigint) ? 'author_id'),'작성자 UUID는 반환하지 않는다');
select is(public.get_community_post(current_setting('test.post')::bigint)->'items'->0->>'price','0','Snapshot 0원 보존');
select is(public.get_community_post(current_setting('test.post')::bigint)->'items'->0->>'name','게시 시점 상품','Snapshot 상품 정보 조회');
select is(jsonb_array_length(public.get_community_feed('vote')),1,'투표 탭은 투표글만 반환한다');
select is(public.get_community_post(current_setting('test.vote')::bigint)->>'buy_count','0','마감된 투표는 미참여자에게도 집계를 공개한다');
select is(public.get_community_post(current_setting('test.hidden')::bigint),null,'숨긴 글은 상세 조회 불가');
select is(public.get_community_post(current_setting('test.deleted')::bigint),null,'삭제 글은 상세 조회 불가');
select is(public.get_community_post(0),null,'없는 글은 목업 대신 null');
select throws_ok($$select * from private.posts$$,'42501',null,'회원도 원본 글 직접 조회 차단');
select throws_ok($$insert into private.post_likes(post_id,user_id) values (1,auth.uid())$$,'42501',null,'회원 원본 좋아요 쓰기 차단');
select throws_ok($$select public.get_community_feed('invalid')$$,'22023','invalid_feed_cursor','잘못된 탭 차단');
select throws_ok($$select public.get_community_feed('all',now(),null)$$,'22023','invalid_feed_cursor','불완전 커서 차단');
select set_config('test.page',public.get_community_feed()::text,true);
select is(jsonb_array_length(public.get_community_feed('all',
 (current_setting('test.page')::jsonb->19->>'created_at')::timestamptz,
 (current_setting('test.page')::jsonb->19->>'id')::bigint)),6,'같은 시각의 글도 커서 다음 6개만 읽는다');
select is(jsonb_array_length(public.get_community_comments(current_setting('test.post')::bigint)),3,'댓글 실제 목록 조회');
select is(public.get_community_comments(current_setting('test.post')::bigint)->0->>'is_post_author','true','글쓴이 댓글 표시');
select is(public.get_community_comments(current_setting('test.post')::bigint)->1->>'anon_number','1','게시물 단위 익명번호 반환');
select is(public.get_community_comments(current_setting('test.post')::bigint)->2->>'content',null,'탈퇴 사용자 댓글 본문 비공개');
select ok(not (public.get_community_comments(current_setting('test.post')::bigint)->1 ? 'author_id'),'댓글 작성자 UUID 비공개');
reset role;
insert into private.vote_responses(post_id,user_id,choice)
 values (current_setting('test.vote')::bigint,'94000000-0000-0000-0000-000000000001','buy');
set local role authenticated;
select is(public.get_community_post(current_setting('test.vote')::bigint)->>'buy_count','1','참여자에게만 집계 공개');
reset role;
insert into private.user_blocks(blocker_id,blocked_id)
 values ('94000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000002');
set local role authenticated;
select is(public.get_community_post(current_setting('test.vote')::bigint),null,'내가 차단한 작성자 글 제외');
select is(public.get_community_post(current_setting('test.post')::bigint)->>'comment_count','2','차단 댓글은 개수에서도 제외');
reset role;
set local request.jwt.claims = '{"sub":"94000000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
select isnt(public.get_community_post(current_setting('test.post')::bigint),null,'차단은 단방향: 차단당한 사용자는 상대 글 열람 가능');
reset role;
insert into private.reports(reporter_id,target_type,post_id,reported_user_id,reason)
 values ('94000000-0000-0000-0000-000000000002','post',current_setting('test.post')::bigint,'94000000-0000-0000-0000-000000000001','spam');
set local role authenticated;
select is(public.get_community_post(current_setting('test.post')::bigint),null,'신고한 작성자의 콘텐츠 제외');
reset role;
update public.profiles set status='suspended',suspended_at=now() where id='94000000-0000-0000-0000-000000000002';
set local role authenticated;
select throws_ok($$select public.get_community_feed()$$,'42501','suspended','정지 계정 피드 접근 차단');
reset role;
select throws_ok($$insert into private.posts(author_id,type,content) values ('94000000-0000-0000-0000-000000000001','post','네글자요')$$,'23514',null,'공백 제외 최소 길이 검증');
select lives_ok($$insert into private.posts(author_id,type,content) values ('94000000-0000-0000-0000-000000000001','post',repeat('가',50))$$,'일반글도 최신 명세의 50자 허용');
select throws_ok($$insert into private.posts(author_id,type,content) values ('94000000-0000-0000-0000-000000000001','post',repeat('가',51))$$,'23514',null,'본문 51자 차단');
select throws_ok($$insert into private.posts(author_id,type,content) values ('94000000-0000-0000-0000-000000000001','vote','투표 내용입니다')$$,'23514',null,'투표 종료 시각 필수');

select * from finish();
rollback;
