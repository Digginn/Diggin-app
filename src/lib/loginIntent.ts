import type { useRouter } from "expo-router";

type Router = ReturnType<typeof useRouter>;

type Resume = () => void;

let pending: Resume | null = null;

/**
 * AUTH-001 로그인 필요 모달에서 로그인을 고르면 이어 할 동작을 남기고 로그인으로 보낸다.
 * 로그인하면 원래 화면으로 돌아가 이 동작을 실행한다. 화면째 막힌 곳은 돌아오기만 한다.
 */
export function startLogin(router: Router, resume: Resume = () => undefined) {
  pending = resume;
  router.push("/login");
}

export function takeLoginIntent() {
  const resume = pending;
  pending = null;
  return resume;
}

export function keepLoginIntent(resume: Resume) {
  pending = resume;
}
