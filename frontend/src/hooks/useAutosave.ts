import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SetStateAction,
} from "react";
import { ApiError, patchSession } from "../lib/api";
import type { SaveStatus, SessionResource } from "../types";

const RETRY_DELAYS = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000];

function isTerminalClientError(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408 &&
    error.status !== 429
  );
}

function sameContent(left: SessionResource, right: SessionResource): boolean {
  return (
    left.name === right.name &&
    left.code === right.code &&
    left.tags.length === right.tags.length &&
    left.tags.every((tag, index) => tag === right.tags[index])
  );
}

export function useAutosave(initialSession: SessionResource) {
  const [draft, setDraft] = useState(initialSession);
  const [persisted, setPersisted] = useState(initialSession);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [conflict, setConflict] = useState<SessionResource | null>(null);
  const [hasUnsettledMutation, setHasUnsettledMutation] = useState(false);
  const draftRef = useRef(draft);
  const persistedRef = useRef(persisted);
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const retryIndexRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const saveNowRef = useRef<() => Promise<boolean>>(async () => false);
  const mountedRef = useRef(true);
  const abandonedRef = useRef(false);
  const activeControllerRef = useRef<AbortController | null>(null);
  const pendingMutationRef = useRef<{
    snapshot: SessionResource;
    expectedRevision: number;
    mutationId: string;
  } | null>(null);

  useEffect(() => {
    draftRef.current = draft;
    persistedRef.current = persisted;
  }, [draft, persisted]);

  const isDirty =
    hasUnsettledMutation ||
    !sameContent(draft, persisted);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const runSaveLoop = useCallback(async (): Promise<boolean> => {
    while (mountedRef.current && !abandonedRef.current) {
      const currentDraft = draftRef.current;
      const base = persistedRef.current;
      const pending =
        pendingMutationRef.current ??
        {
          snapshot: currentDraft,
          expectedRevision: base.revision,
          mutationId: crypto.randomUUID(),
        };
      pendingMutationRef.current = pending;
      setHasUnsettledMutation(true);
      const { snapshot, expectedRevision, mutationId } = pending;
      if (sameContent(snapshot, base)) {
        pendingMutationRef.current = null;
        setHasUnsettledMutation(false);
        if (mountedRef.current) {
          setStatus("saved");
        }
        return true;
      }

      if (mountedRef.current) setStatus("saving");
      const controller = new AbortController();
      activeControllerRef.current = controller;

      try {
        const response = await patchSession(
          snapshot.id,
          {
            name: snapshot.name,
            code: snapshot.code,
            tags: snapshot.tags,
            expected_revision: expectedRevision,
            mutation_id: mutationId,
          },
          controller.signal,
        );
        if (!mountedRef.current || abandonedRef.current) return false;

        pendingMutationRef.current = null;
        setHasUnsettledMutation(false);
        const latestDraft = draftRef.current;
        if (
          response.mutation.superseded &&
          !sameContent(response.session, latestDraft)
        ) {
          setConflict(response.session);
          setStatus("conflict");
          return false;
        }
        setPersisted(response.session);
        persistedRef.current = response.session;
        retryIndexRef.current = 0;
        if (sameContent(latestDraft, snapshot)) {
          setDraft(response.session);
          draftRef.current = response.session;
          setStatus("saved");
          return true;
        }
      } catch (error: unknown) {
        if (
          controller.signal.aborted &&
          (!mountedRef.current || abandonedRef.current)
        ) {
          return false;
        }
        if (
          error instanceof ApiError &&
          error.status === 409 &&
          error.body.error.details.session
        ) {
          const server = error.body.error.details.session;
          if (sameContent(server, draftRef.current)) {
            pendingMutationRef.current = null;
            setHasUnsettledMutation(false);
            setPersisted(server);
            persistedRef.current = server;
            setStatus("saved");
            return true;
          }
          pendingMutationRef.current = null;
          setHasUnsettledMutation(false);
          setConflict(server);
          setStatus("conflict");
          return false;
        }
        if (isTerminalClientError(error)) {
          pendingMutationRef.current = null;
          setHasUnsettledMutation(false);
          retryIndexRef.current = 0;
          setStatus("failed");
          return false;
        }
        setStatus("failed");
        const delay =
          RETRY_DELAYS[
            Math.min(retryIndexRef.current, RETRY_DELAYS.length - 1)
          ];
        retryIndexRef.current += 1;
        clearTimer();
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null;
          void saveNowRef.current();
        }, delay);
        return false;
      } finally {
        if (activeControllerRef.current === controller) {
          activeControllerRef.current = null;
        }
      }
    }
    return false;
  }, [clearTimer]);

  const saveNow = useCallback((): Promise<boolean> => {
    if (inFlightRef.current) return inFlightRef.current;
    if (abandonedRef.current) return Promise.resolve(false);
    clearTimer();
    const operation = runSaveLoop().finally(() => {
      inFlightRef.current = null;
    });
    inFlightRef.current = operation;
    return operation;
  }, [clearTimer, runSaveLoop]);

  useEffect(() => {
    saveNowRef.current = saveNow;
  }, [saveNow]);

  const updateDraft = useCallback(
    (value: SetStateAction<SessionResource>) => {
      setDraft((current) => {
        const next =
          typeof value === "function"
            ? (value as (session: SessionResource) => SessionResource)(current)
            : value;
        draftRef.current = next;
        return next;
      });
      setStatus((current) =>
        current === "conflict" || current === "saving" ? current : "scheduled",
      );
    },
    [],
  );

  useEffect(() => {
    if (
      !isDirty ||
      status === "conflict" ||
      status === "saving" ||
      status === "failed"
    ) {
      return;
    }
    clearTimer();
    timerRef.current = window.setTimeout(() => void saveNow(), 800);
    return () => {
      clearTimer();
    };
  }, [
    clearTimer,
    draft.code,
    draft.name,
    draft.tags,
    isDirty,
    saveNow,
    status,
  ]);

  useEffect(() => {
    mountedRef.current = true;
    abandonedRef.current = false;
    return () => {
      mountedRef.current = false;
      abandonedRef.current = true;
      clearTimer();
      activeControllerRef.current?.abort();
    };
  }, [clearTimer]);

  const abandon = useCallback(() => {
    abandonedRef.current = true;
    clearTimer();
    pendingMutationRef.current = null;
    setHasUnsettledMutation(false);
    activeControllerRef.current?.abort();
  }, [clearTimer]);

  const keepLocal = useCallback(async () => {
    if (!conflict) return;
    setPersisted(conflict);
    persistedRef.current = conflict;
    pendingMutationRef.current = null;
    setHasUnsettledMutation(false);
    setConflict(null);
    setStatus("scheduled");
    await saveNow();
  }, [conflict, saveNow]);

  const loadServer = useCallback(() => {
    if (!conflict) return;
    setDraft(conflict);
    draftRef.current = conflict;
    setPersisted(conflict);
    persistedRef.current = conflict;
    pendingMutationRef.current = null;
    setHasUnsettledMutation(false);
    clearTimer();
    setConflict(null);
    setStatus("saved");
  }, [clearTimer, conflict]);

  return {
    draft,
    setDraft: updateDraft,
    status,
    conflict,
    isDirty,
    saveNow,
    abandon,
    keepLocal,
    loadServer,
  };
}
