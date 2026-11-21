import { useCallback, useEffect, useState } from "react";

import { consoleQuery } from "../api/moderation";

export function useAdminQuery<T>(
  resource: string,
  params: Record<string, unknown> = {},
  { keepDataOnRefresh = false }: { keepDataOnRefresh?: boolean } = {},
) {
  const key = JSON.stringify({ resource, ...params });
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    data?: T;
    error?: unknown;
    isLoading: boolean;
  }>({ key, isLoading: true });
  useEffect(() => {
    const controller = new AbortController();
    const { resource: queryResource, ...queryParams } = JSON.parse(key) as {
      resource: string;
    } & Record<string, unknown>;
    consoleQuery<T>(queryResource, queryParams, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setResult({ key, data, isLoading: false });
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setResult((previous) => ({
            key,
            data: keepDataOnRefresh && previous.key === key ? previous.data : undefined,
            error,
            isLoading: false,
          }));
      },
    );
    return () => controller.abort();
  }, [key, revision, keepDataOnRefresh]);
  const refresh = useCallback(() => {
    setResult((previous) => ({
      key,
      data: keepDataOnRefresh && previous.key === key ? previous.data : undefined,
      isLoading: true,
    }));
    setRevision((value) => value + 1);
  }, [key, keepDataOnRefresh]);
  return {
    ...(result.key === key ? result : { isLoading: true, data: undefined, error: undefined }),
    refresh,
  };
}
