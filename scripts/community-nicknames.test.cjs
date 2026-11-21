/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const ts = require("typescript");

function load(file, mocks = {}) {
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(readFileSync(path.join(__dirname, "..", file), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    { module, exports: module.exports, require: (name) => mocks[name] ?? require(name) },
  );
  return module.exports;
}

const { formatCommunityAuthor } = load("src/screens/diggle/utils/formatCommunityAuthor.ts");
test("닉네임과 본인·글쓴이 라벨을 조합하고 구버전 응답에는 일반 라벨을 사용한다", () => {
  assert.equal(formatCommunityAuthor("느긋한디기12"), "느긋한디기12");
  assert.equal(formatCommunityAuthor("느긋한디기12", true), "느긋한디기12 (나)");
  assert.equal(formatCommunityAuthor("느긋한디기12", false, true), "느긋한디기12 (글쓴이)");
  assert.equal(formatCommunityAuthor("느긋한디기12", true, true), "느긋한디기12 (나)");
  for (const missing of [undefined, null, "", "  "]) {
    assert.equal(formatCommunityAuthor(missing), "사용자");
  }
});

test("활성 관리자 댓글만 Diggin으로 표시하고 실제 닉네임과 본인·글쓴이 구분을 보존한다", () => {
  const { parseCommunityComment } = load("src/screens/diggle/api/community.ts", {
    "@/lib/supabase": { supabase: {} },
  });
  const row = {
    id: "1",
    created_at: "2026-11-21T01:00:00Z",
    author_nickname: "느긋한디기12",
    is_operator: true,
  };
  const comment = parseCommunityComment(row);
  assert.equal(comment.authorNickname, "느긋한디기12");
  assert.equal(
    formatCommunityAuthor(comment.authorNickname, false, false, comment.isOperator),
    "Diggin",
  );
  assert.equal(
    formatCommunityAuthor(comment.authorNickname, true, false, comment.isOperator),
    "Diggin (나)",
  );
  assert.equal(
    formatCommunityAuthor(comment.authorNickname, false, true, comment.isOperator),
    "Diggin (글쓴이)",
  );
  assert.equal(
    formatCommunityAuthor(comment.authorNickname, true, true, comment.isOperator),
    "Diggin (나)",
  );
  for (const is_operator of [false, undefined, "true"]) {
    const ordinary = parseCommunityComment({ ...row, is_operator });
    assert.equal(
      formatCommunityAuthor(ordinary.authorNickname, false, false, ordinary.isOperator),
      "느긋한디기12",
    );
  }
  const withdrawn = parseCommunityComment({ ...row, is_withdrawn: true });
  assert.equal(withdrawn.isOperator, false);
  assert.equal(
    formatCommunityAuthor(withdrawn.authorNickname, false, false, withdrawn.isOperator),
    "사용자",
  );
});

test("게시글·댓글 파싱은 닉네임만 추가하며 비회원·탈퇴 응답과 내부 개인정보를 노출하지 않는다", () => {
  const { parsePost, parseCommunityComment } = load("src/screens/diggle/api/community.ts", {
    "@/lib/supabase": { supabase: {} },
  });
  const row = {
    id: "1",
    type: "post",
    created_at: "2026-11-08T01:00:00Z",
    content: "내용",
    items: [],
    author_nickname: "느긋한디기12",
    author_id: "hidden",
    email: "hidden@example.test",
  };
  assert.equal(parsePost(row).authorNickname, null);
  const post = parsePost({ ...row, is_mine: false });
  assert.equal(post.authorNickname, "느긋한디기12");
  assert.equal("author_id" in post, false);
  assert.equal("email" in post, false);
  assert.equal(parseCommunityComment(row).authorNickname, "느긋한디기12");
  assert.equal(parseCommunityComment({ ...row, is_withdrawn: true }).authorNickname, null);
  assert.equal(parseCommunityComment({ ...row, author_nickname: undefined }).authorNickname, null);
});

test("닉네임 저장 성공 시 커뮤니티 전체 캐시를 무효화하고 재조회 완료를 기다리지 않는다", async () => {
  for (const result of [null, "duplicate"]) {
    const invalidations = [];
    const { saveNickname } = load("src/screens/my/api/profile.ts", {
      "@/api/avatar": { AVATAR_BUCKET: "avatars" },
      "@/lib/supabase": { supabase: { rpc: async () => ({ data: result, error: null }) } },
      "@/screens/diggle/api/community": { communityKeys: { all: ["community"] } },
      "@/lib/queryClient": {
        queryClient: {
          invalidateQueries: (value) => {
            invalidations.push(value);
            return new Promise(() => {});
          },
        },
      },
    });
    const value = await Promise.race([
      saveNickname("느긋한디기12"),
      new Promise((_, reject) =>
        setImmediate(() => reject(new Error("닉네임 저장이 재조회를 기다림"))),
      ),
    ]);
    assert.equal(invalidations.length, result === null ? 1 : 0);
    if (result === null) {
      assert.equal(value, undefined);
      assert.equal(invalidations[0].queryKey[0], "community");
    } else assert.equal(value, "이미 사용 중인 닉네임입니다.");
  }
});

test("댓글 라벨은 서버의 관리자 여부·투표 선택만 사용하며 구버전·탈퇴 응답에는 표시하지 않는다", () => {
  const { parseCommunityComment } = load("src/screens/diggle/api/community.ts", {
    "@/lib/supabase": { supabase: {} },
  });
  const row = { id: "1", created_at: "2026-11-21T01:00:00Z", author_nickname: "Diggin" };
  assert.equal(parseCommunityComment(row).isOperator, false);
  assert.equal(parseCommunityComment(row).voteChoice, null);
  for (const choice of ["buy", "not", null]) {
    const comment = parseCommunityComment({ ...row, is_operator: true, vote_choice: choice });
    assert.equal(comment.isOperator, true);
    assert.equal(comment.voteChoice, choice);
    const withdrawn = parseCommunityComment({
      ...row,
      is_operator: true,
      vote_choice: choice,
      is_withdrawn: true,
    });
    assert.equal(withdrawn.isOperator, false);
    assert.equal(withdrawn.voteChoice, null);
  }
  assert.equal(parseCommunityComment({ ...row, is_operator: "true" }).isOperator, false);
  assert.throws(
    () => parseCommunityComment({ ...row, vote_choice: "other" }),
    /invalid_community_response/,
  );
});
