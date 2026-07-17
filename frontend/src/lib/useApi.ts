import { useCallback, useEffect, useState } from "react";

export type ApiState<T> =
  | { status: "loading"; data?: undefined }
  | { status: "error"; error: string; data?: undefined }
  | { status: "ready"; data: T };

/**
 * Minimal data-fetching hook for the API layer: loading → ready | error,
 * with a stable `retry`. Screens branch on `state.status` so every
 * data-driven section has real loading and error states before the
 * backend is wired in.
 */
export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[] = []): {
  state: ApiState<T>;
  retry: () => void;
} {
  const [state, setState] = useState<ApiState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((a) => a + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetcher().then(
      (data) => {
        if (!cancelled) setState({ status: "ready", data });
      },
      (err: unknown) => {
        if (!cancelled)
          setState({ status: "error", error: err instanceof Error ? err.message : String(err) });
      }
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, ...deps]);

  return { state, retry };
}
