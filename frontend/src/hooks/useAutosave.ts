import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SetStateAction,
} from "react";
import { ApiError, patchSession } from "../lib/api";
import { sameSessionContent } from "../lib/sessionContent";
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
    forceAutoTag: boolean;
  } | null>(null);
  const forceAutoTagRequestedRef = useRef(false);

  useEffect(() => {
    draftRef.current = draft;
    persistedRef.current = persisted;
  }, [draft, persisted]);

  const isDirty =
    hasUnsettledMutation ||
    !sameSessionContent(draft, persisted);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const runSaveLoop = useCallback(async (): Promise<boolean> => {
    while (mountedRef.current && !abandonedRef.current) {
      const base = persistedRef.current;
      let pending = pendingMutationRef.current;
      if (!pending) {
        pending = {
          snapshot: draftRef.current,
          expectedRevision: base.revision,
          mutationId: crypto.randomUUID(),
          forceAutoTag: forceAutoTagRequestedRef.current,
        };
        forceAutoTagRequestedRef.current = false;
      }
      pendingMutationRef.current = pending;

      const { snapshot, expectedRevision, mutationId, forceAutoTag } = pending;

      if (!forceAutoTag && sameSessionContent(snapshot, base)) {
        pendingMutationRef.current = null;
        if (forceAutoTagRequestedRef.current) {
          continue;
        }
        setHasUnsettledMutation(false);
        if (mountedRef.current) {
          setStatus("saved");
        }
        return true;
      }

      setHasUnsettledMutation(true);
      if (mountedRef.current) setStatus("saving");
      const controller = new AbortController();
      activeControllerRef.current = controller;

      const payload: Parameters<typeof patchSession>[1] = {
        auto_tag_if_empty: true,
        expected_revision: expectedRevision,
        mutation_id: mutationId,
      };
      if (snapshot.name !== base.name) payload.name = snapshot.name;
      if (snapshot.code !== base.code) payload.code = snapshot.code;
      if (
        snapshot.tags.length !== base.tags.length ||
        snapshot.tags.some((tag, index) => tag !== base.tags[index])
      ) {
        payload.tags = snapshot.tags;
      }
      if (snapshot.ref_url !== base.ref_url) payload.ref_url = snapshot.ref_url;
      if (snapshot.notes_markdown !== base.notes_markdown) {
        payload.notes_markdown = snapshot.notes_markdown;
      }

      try {
        const response = await patchSession(
          snapshot.id,
          payload,
          controller.signal,
        );
        if (!mountedRef.current || abandonedRef.current) return false;

        pendingMutationRef.current = null;
        let latestDraft = draftRef.current;
        if (
          response.mutation.superseded &&
          !sameSessionContent(response.session, latestDraft)
        ) {
          setHasUnsettledMutation(false);
          setConflict(response.session);
          setStatus("conflict");
          return false;
        }

        const shouldMergeServerTags =
          latestDraft.tags.length === 0 &&
          snapshot.tags.length === 0 &&
          response.session.tags.length > 0 &&
          (
            response.mutation.auto_tags_added.length > 0 ||
            response.mutation.duplicate
          );
        if (shouldMergeServerTags) {
          latestDraft = {
            ...latestDraft,
            tags: response.session.tags,
          };
          setDraft(latestDraft);
          draftRef.current = latestDraft;
        }

        setPersisted(response.session);
        persistedRef.current = response.session;
        retryIndexRef.current = 0;
        if (sameSessionContent(latestDraft, response.session)) {
          setDraft(response.session);
          draftRef.current = response.session;
          if (forceAutoTagRequestedRef.current) {
            continue;
          }
          setHasUnsettledMutation(false);
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
          if (sameSessionContent(server, draftRef.current)) {
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

  const saveNow = useCallback(
    (forceAutoTag = false): Promise<boolean> => {
      if (forceAutoTag) {
        forceAutoTagRequestedRef.current = true;
      }
      if (inFlightRef.current) {
        return inFlightRef.current;
      }
      if (abandonedRef.current) return Promise.resolve(false);
      clearTimer();
      const operation = runSaveLoop().finally(() => {
        inFlightRef.current = null;
      });
      inFlightRef.current = operation;
      return operation;
    },
    [clearTimer, runSaveLoop],
  );

  useEffect(() => {
    saveNowRef.current = () => saveNow(false);
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
    timerRef.current = window.setTimeout(() => void saveNow(false), 800);
    return () => {
      clearTimer();
    };
  }, [
    clearTimer,
    draft.code,
    draft.name,
    draft.tags,
    draft.ref_url,
    draft.notes_markdown,
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
    await saveNow(false);
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
