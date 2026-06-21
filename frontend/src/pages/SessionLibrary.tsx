import {
  ArrowRight,
  Code2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { useModalFocus } from "../hooks/useModalFocus";
import {
  createSession,
  deleteSession,
  listSessions,
  patchSession,
} from "../lib/api";
import { formatRelativeTime } from "../lib/format";
import type { SessionSummary } from "../types";

export function SessionLibrary() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<SessionSummary | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<SessionSummary | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const generationRef = useRef(0);
  const listControllersRef = useRef(new Set<AbortController>());
  const requestedCursorsRef = useRef(new Set<string>());
  const createMutationIdRef = useRef<string | null>(null);
  const createControllerRef = useRef<AbortController | null>(null);
  const renameControllerRef = useRef<AbortController | null>(null);
  const renameMutationIdsRef = useRef(new Map<string, string>());
  const deleteMutationIdsRef = useRef(new Map<string, string>());
  const deleteControllerRef = useRef<AbortController | null>(null);
  const actionButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const dialogReturnFocusRef = useRef<HTMLElement | null>(null);
  const renameDialogRef = useModalFocus<HTMLFormElement>({
    active: renameTarget !== null,
    returnFocusRef: dialogReturnFocusRef,
  });
  const deleteDialogRef = useModalFocus<HTMLDivElement>({
    active: deleteTarget !== null,
    returnFocusRef: dialogReturnFocusRef,
  });

  const load = useCallback(async (
    nextQuery: string,
    nextCursor: string | null,
    generation: number,
  ) => {
    const requestKey = nextCursor ?? "__first_page__";
    if (
      generation !== generationRef.current ||
      requestedCursorsRef.current.has(requestKey)
    ) {
      return;
    }
    requestedCursorsRef.current.add(requestKey);
    const controller = new AbortController();
    listControllersRef.current.add(controller);
    try {
      if (!nextCursor) setLoading(true);
      setError("");
      const response = await listSessions(
        nextQuery,
        nextCursor,
        controller.signal,
      );
      if (
        controller.signal.aborted ||
        generation !== generationRef.current
      ) {
        return;
      }
      setSessions((current) =>
        nextCursor
          ? [
              ...current,
              ...response.items.filter(
                (item) => !current.some((existing) => existing.id === item.id),
              ),
            ]
          : response.items,
      );
      const nextResponseCursor = response.next_cursor;
      setCursor(
        nextResponseCursor &&
          nextResponseCursor !== nextCursor &&
          !requestedCursorsRef.current.has(nextResponseCursor)
          ? nextResponseCursor
          : null,
      );
    } catch (loadError) {
      if (
        controller.signal.aborted ||
        generation !== generationRef.current
      ) {
        return;
      }
      setError(
        loadError instanceof Error ? loadError.message : "Could not load sessions.",
      );
    } finally {
      listControllersRef.current.delete(controller);
      if (generation === generationRef.current) setLoading(false);
    }
  }, []);

  const resetAndLoad = useCallback(
    (nextQuery: string) => {
      generationRef.current += 1;
      const generation = generationRef.current;
      for (const controller of listControllersRef.current) controller.abort();
      listControllersRef.current.clear();
      requestedCursorsRef.current.clear();
      setSessions([]);
      setCursor(null);
      setLoading(true);
      void load(nextQuery, null, generation);
    },
    [load],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchParams(query.trim() ? { q: query.trim() } : {}, { replace: true });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [query, setSearchParams]);

  useEffect(() => {
    generationRef.current += 1;
    for (const controller of listControllersRef.current) controller.abort();
    listControllersRef.current.clear();
    requestedCursorsRef.current.clear();
    const generation = generationRef.current;
    queueMicrotask(() => {
      if (generation !== generationRef.current) return;
      setSessions([]);
      setCursor(null);
      setLoading(true);
    });
    const timer = window.setTimeout(() => {
      void load(query, null, generation);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [load, query]);

  useEffect(() => {
    const listControllers = listControllersRef.current;
    return () => {
      generationRef.current += 1;
      for (const controller of listControllers) controller.abort();
      createControllerRef.current?.abort();
      renameControllerRef.current?.abort();
      deleteControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !cursor) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        void load(query, cursor, generationRef.current);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [cursor, load, query]);

  const handleCreate = async () => {
    if (creating || createControllerRef.current) return;
    setCreating(true);
    const mutationId =
      createMutationIdRef.current ?? crypto.randomUUID();
    createMutationIdRef.current = mutationId;
    const controller = new AbortController();
    createControllerRef.current = controller;
    try {
      const response = await createSession(mutationId, controller.signal);
      createMutationIdRef.current = null;
      navigate(`/sessions/${response.session.id}`);
    } catch (createError) {
      if (controller.signal.aborted) return;
      setError(
        createError instanceof Error
          ? createError.message
          : "Could not create a session.",
      );
      setCreating(false);
    } finally {
      if (createControllerRef.current === controller) {
        createControllerRef.current = null;
      }
    }
  };

  const openRename = (session: SessionSummary) => {
    dialogReturnFocusRef.current =
      actionButtonRefs.current.get(session.id) ?? null;
    setMenuId(null);
    setRenameTarget(session);
    setRenameValue(session.name);
  };

  const handleRename = async () => {
    if (!renameTarget || renameValue.trim() === renameTarget.name) {
      setRenameTarget(null);
      return;
    }
    if (renameControllerRef.current) return;
    const operationKey = [
      renameTarget.id,
      renameTarget.revision,
      renameValue,
    ].join(":");
    const mutationId =
      renameMutationIdsRef.current.get(operationKey) ?? crypto.randomUUID();
    renameMutationIdsRef.current.set(operationKey, mutationId);
    const controller = new AbortController();
    renameControllerRef.current = controller;
    try {
      await patchSession(
        renameTarget.id,
        {
          name: renameValue,
          expected_revision: renameTarget.revision,
          mutation_id: mutationId,
        },
        controller.signal,
      );
      renameMutationIdsRef.current.delete(operationKey);
      setRenameTarget(null);
      resetAndLoad(query);
    } catch (renameError) {
      if (controller.signal.aborted) return;
      setError(
        renameError instanceof Error
          ? renameError.message
          : "Could not rename the session.",
      );
    } finally {
      if (renameControllerRef.current === controller) {
        renameControllerRef.current = null;
      }
    }
  };

  const openDelete = (session: SessionSummary) => {
    dialogReturnFocusRef.current =
      actionButtonRefs.current.get(session.id) ?? null;
    setMenuId(null);
    setDeleteTarget(session);
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleteControllerRef.current) return;
    const operationKey = `${deleteTarget.id}:${deleteTarget.revision}`;
    const mutationId =
      deleteMutationIdsRef.current.get(operationKey) ?? crypto.randomUUID();
    deleteMutationIdsRef.current.set(operationKey, mutationId);
    const controller = new AbortController();
    deleteControllerRef.current = controller;
    try {
      await deleteSession(
        deleteTarget.id,
        deleteTarget.revision,
        mutationId,
        controller.signal,
      );
      deleteMutationIdsRef.current.delete(operationKey);
      setSessions((current) =>
        current.filter((item) => item.id !== deleteTarget.id),
      );
      setDeleteTarget(null);
    } catch (deleteError) {
      if (controller.signal.aborted) return;
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Could not delete the session.",
      );
    } finally {
      if (deleteControllerRef.current === controller) {
        deleteControllerRef.current = null;
      }
    }
  };

  return (
    <AppShell
      actions={
        <button
          className="primary-button"
          type="button"
          onClick={handleCreate}
          disabled={creating}
        >
          <Plus size={17} />
          {creating ? "Creating…" : "New session"}
        </button>
      }
    >
      <main className="library">
        <section className="library-hero">
          <div>
            <span className="hero-kicker">
              <Sparkles size={14} />
              Your local Python workspace
            </span>
            <h1>Pick up where you left off.</h1>
            <p>
              Focused coding sessions, instant Python runs, and no noisy
              suggestions getting between you and the problem.
            </p>
          </div>
          <div className="hero-orb" aria-hidden="true">
            <Code2 size={38} />
          </div>
        </section>

        <section className="session-section">
          <div className="session-toolbar">
            <div>
              <span className="eyebrow">Workspace</span>
              <h2>Your sessions</h2>
            </div>
            <label className="search-field">
              <Search size={17} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search sessions"
                aria-label="Search sessions"
              />
              <kbd>/</kbd>
            </label>
          </div>

          {error && <div className="inline-error">{error}</div>}

          {loading && sessions.length === 0 ? (
            <div className="session-grid" aria-label="Loading sessions">
              {[0, 1, 2].map((item) => (
                <div className="session-card session-card--skeleton" key={item} />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">
                <Code2 size={27} />
              </span>
              <h3>{query ? "No matching sessions" : "Your first idea starts here"}</h3>
              <p>
                {query
                  ? "Try another name, or create a fresh session."
                  : "Create a session and CodeBro will keep every edit saved locally."}
              </p>
              <button className="primary-button" type="button" onClick={handleCreate}>
                <Plus size={17} />
                Create a session
              </button>
            </div>
          ) : (
            <div className="session-grid">
              {sessions.map((session) => (
                <article className="session-card" key={session.id}>
                  <button
                    className="session-card-main"
                    type="button"
                    onClick={() => navigate(`/sessions/${session.id}`)}
                  >
                    <div className="session-card-top">
                      <span className="file-badge">PY</span>
                      <span title={new Date(session.updated_at).toLocaleString()}>
                        {formatRelativeTime(session.updated_at)}
                      </span>
                    </div>
                    <h3>{session.name}</h3>
                    <code>{session.code_preview || "# Empty session"}</code>
                    <span className="open-label">
                      Open session
                      <ArrowRight size={15} />
                    </span>
                  </button>
                  <div className="card-menu">
                    <button
                      ref={(node) => {
                        if (node) {
                          actionButtonRefs.current.set(session.id, node);
                        } else {
                          actionButtonRefs.current.delete(session.id);
                        }
                      }}
                      className="icon-button icon-button--quiet"
                      type="button"
                      aria-label={`Actions for ${session.name}`}
                      onClick={() =>
                        setMenuId((current) =>
                          current === session.id ? null : session.id,
                        )
                      }
                    >
                      <MoreHorizontal size={18} />
                    </button>
                    {menuId === session.id && (
                      <div className="menu-popover">
                        <button type="button" onClick={() => openRename(session)}>
                          <Pencil size={14} />
                          Rename
                        </button>
                        <button
                          className="danger-action"
                          type="button"
                          onClick={() => openDelete(session)}
                        >
                          <Trash2 size={14} />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
          <div ref={sentinelRef} className="pagination-sentinel">
            {cursor ? "Loading more…" : sessions.length ? "You’re all caught up." : ""}
          </div>
        </section>
      </main>
      {renameTarget && (
        <div className="dialog-backdrop" role="presentation">
          <form
            ref={renameDialogRef}
            className="dialog dialog--form"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-title"
            tabIndex={-1}
            onSubmit={(event) => {
              event.preventDefault();
              void handleRename();
            }}
          >
            <span className="dialog-icon">
              <Pencil size={20} />
            </span>
            <div>
              <span className="eyebrow">Session details</span>
              <h2 id="rename-title">Rename session</h2>
              <input
                className="dialog-input"
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                maxLength={120}
                autoFocus
                aria-label="New session name"
              />
            </div>
            <div className="dialog-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setRenameTarget(null)}
              >
                Cancel
              </button>
              <button className="primary-button" type="submit">
                Save name
              </button>
            </div>
          </form>
        </div>
      )}
      {deleteTarget && (
        <div className="dialog-backdrop" role="presentation">
          <div
            ref={deleteDialogRef}
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            tabIndex={-1}
          >
            <span className="dialog-icon dialog-icon--danger">
              <Trash2 size={20} />
            </span>
            <div>
              <span className="eyebrow">Delete session</span>
              <h2 id="delete-title">Remove “{deleteTarget.name}”?</h2>
              <p>
                The session will disappear from CodeBro. Its database record is
                retained as a soft deletion for manual recovery.
              </p>
            </div>
            <div className="dialog-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                className="danger-button"
                type="button"
                onClick={() => void handleDelete()}
              >
                Delete session
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
