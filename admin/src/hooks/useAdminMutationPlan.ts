import { useState } from "react";

import { AdminApiError, adminRequest, errorMessage } from "../lib/supabase";

type Operation = { body: Record<string, unknown>; isDone: boolean };
type PendingState = { scope?: string; operations: Operation[]; hasStorageError?: boolean };
const running = new Set<string>();
const storageKey = (scope: string) =>
  `diggin-admin-pending:${import.meta.env.VITE_SUPABASE_URL}:${scope}`;

function readPlan(scope: string): Operation[] {
  const raw = sessionStorage.getItem(storageKey(scope));
  if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  if (
    !Array.isArray(value) ||
    !value.every(
      (operation: unknown) =>
        operation !== null &&
        typeof operation === "object" &&
        "isDone" in operation &&
        typeof operation.isDone === "boolean" &&
        "body" in operation &&
        operation.body !== null &&
        typeof operation.body === "object" &&
        "request_id" in operation.body &&
        typeof operation.body.request_id === "string",
    )
  )
    throw new Error("invalid_pending_plan");
  return value as Operation[];
}

export function clearAdminMutationPlan(scope: string) {
  sessionStorage.removeItem(storageKey(scope));
}

function restorePlan(scope?: string): PendingState {
  try {
    return { scope, operations: scope ? readPlan(scope) : [] };
  } catch {
    return { scope, operations: [], hasStorageError: true };
  }
}

// 요청 본문과 성공한 단계만 같은 탭에 보관한다. 인증 토큰은 저장하지 않는다.
export function useAdminMutationPlan(scope: string | undefined, onSettled: () => void) {
  const [saved, setSaved] = useState<PendingState>(() => restorePlan(scope));
  const [error, setError] = useState("");
  const [isApplying, setIsApplying] = useState(false);
  // 상세 조회로 대상이 결정됐을 때만 복구한다. 재조회 중에는 진행 상태를 유지한다.
  if (scope && saved.scope !== scope) setSaved(restorePlan(scope));
  const currentScope = scope ?? saved.scope;
  const isReady = Boolean(currentScope && saved.scope === currentScope && !saved.hasStorageError);
  const hasPendingPlan = saved.operations.length > 0;

  async function runPlan(bodies?: Record<string, unknown>[]) {
    if (!currentScope || !isReady || running.has(currentScope)) return false;
    const key = currentScope;
    running.add(key);
    setIsApplying(true);
    setError("");
    let operations: Operation[] = [];
    function save(next: Operation[]) {
      try {
        if (next.length) sessionStorage.setItem(storageKey(key), JSON.stringify(next));
        else clearAdminMutationPlan(key);
      } catch {
        throw new AdminApiError("pending_request_storage_unavailable");
      }
      setSaved({ scope: key, operations: [...next] });
    }
    try {
      operations = readPlan(key);
      if (bodies) {
        // 이동 직전의 미확인 요청을 새 요청으로 덮어쓰지 않는다.
        if (operations.length) throw new AdminApiError("sanction_request_pending", 409);
        operations = bodies.map((body) => ({
          body: { ...body, request_id: crypto.randomUUID() },
          isDone: false,
        }));
        // 보관에 실패하면 전송하지 않는다. 응답 전 이탈해도 같은 ID를 복구한다.
        save(operations);
      }
      for (const operation of operations) {
        if (operation.isDone) continue;
        try {
          await adminRequest(operation.body);
          operation.isDone = true;
          save(operations);
        } catch (failure) {
          if (
            failure instanceof AdminApiError &&
            ["auth_moderation_failed", "request_failed_use_new_id"].includes(failure.code)
          ) {
            operation.body.request_id = crypto.randomUUID();
            save(operations);
          }
          throw failure;
        }
      }
      save([]);
      return true;
    } catch (failure) {
      const hasPartial = operations.some((operation) => operation.isDone);
      if (
        failure instanceof AdminApiError &&
        failure.status >= 400 &&
        failure.status < 500 &&
        !failure.code.includes("pending") &&
        failure.code !== "request_failed_use_new_id"
      ) {
        try {
          save([]);
        } catch (storageFailure) {
          setError(errorMessage(storageFailure));
          return false;
        }
      }
      setError(`${hasPartial ? "일부 조치는 적용되었습니다. " : ""}${errorMessage(failure)}`);
      return false;
    } finally {
      running.delete(key);
      setIsApplying(false);
      onSettled();
    }
  }
  return {
    runPlan,
    isReady,
    hasPendingPlan,
    isApplying,
    error: saved.hasStorageError
      ? "재시도 정보를 읽을 수 없습니다. 브라우저 저장소 설정을 확인해 주세요."
      : error,
    operations: saved.operations,
  };
}
