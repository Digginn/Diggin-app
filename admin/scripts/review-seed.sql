begin;
insert into private.admin_users(id,email,role) values (:'admin_id','admin@diggin.local','operator');
update public.profiles set nickname='리뷰운영자' where id=:'admin_id';
update public.profiles set nickname='느긋한디기12' where id=:'author_id';
update public.profiles set nickname='활발한디기34' where id=:'second_id';
update public.profiles set nickname='차분한디기56' where id=:'reporter_id';

insert into private.posts(author_id,type,content) values
  (:'author_id','post','로컬 검증용 게시글입니다. 신고 상세를 확인해 주세요.') returning id as first_post \gset
insert into private.post_products(post_id,position,name,brand,price,url) values
  (:first_post,1,'리뷰용 스니커즈','예시 브랜드',99000,'https://example.com/review-product');
insert into private.reports(reporter_id,target_type,post_id,reported_user_id,reason) values
  (:'reporter_id','post',:first_post,:'author_id','abuse'),
  (:'second_id','post',:first_post,:'author_id','spam');

insert into private.comments(post_id,author_id,content) values
  (:first_post,:'second_id','로컬 검증용 댓글입니다.') returning id as first_comment \gset
insert into private.reports(reporter_id,target_type,comment_id,reported_user_id,reason,reported_content,status) values
  (:'reporter_id','comment',:first_comment,:'second_id','inappropriate','로컬 검증용 댓글입니다.','reviewing');

insert into private.posts(author_id,type,content) values
  (:'author_id','post','처리 완료 상태를 확인하는 예시 게시글입니다.') returning id as resolved_post \gset
insert into private.reports(reporter_id,target_type,post_id,reported_user_id,reason,status) values
  (:'reporter_id','post',:resolved_post,:'author_id','spam','resolved');
insert into private.posts(author_id,type,content) values
  (:'second_id','post','반려 상태를 확인하는 예시 게시글입니다.') returning id as rejected_post \gset
insert into private.reports(reporter_id,target_type,post_id,reported_user_id,reason,status) values
  (:'reporter_id','post',:rejected_post,:'second_id','other','rejected');

insert into private.admin_actions(admin_id,request_id,action,target_type,target_id,reason_category,reason,before_state,after_state)
  values(:'admin_id',gen_random_uuid(),'community_restricted','user',:'second_id','spam','로컬 검증용 기존 제재',
    '{"status":"active"}',jsonb_build_object('status','community_restricted','restricted_until',now()+interval '7 days'))
  returning id as initial_action \gset
insert into private.user_sanctions(user_id,action_id,kind,reason_category,restricted_until)
  values(:'second_id',:initial_action,'community_restricted','spam',now()+interval '7 days');
update public.profiles set status='community_restricted',restricted_until=now()+interval '7 days' where id=:'second_id';
commit;
