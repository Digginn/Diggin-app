-- #183 korcen 사전에서 빠진 흔한 비속어와 자모 약어를 추가한다. 닉네임·게시글·댓글이 함께 쓴다.
-- 닉네임은 자모를 허용하지 않아 자모 약어는 본문에서만 의미가 있다.
insert into private.nickname_banned_words (word, kind)
values
  ('씨발', 'profanity'),
  ('ㅅㅂ', 'profanity'),
  ('ㅆㅂ', 'profanity'),
  ('존나', 'profanity'),
  ('졸라', 'profanity'),
  ('ㅈㄴ', 'profanity'),
  ('ㅂㅅ', 'profanity'),
  ('ㅈ같', 'profanity')
on conflict (word) do nothing;
