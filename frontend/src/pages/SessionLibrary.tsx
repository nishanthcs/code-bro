import {
  CalendarDays,
  Clock3,
  Code2,
  Database,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Settings2,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { useModalFocus } from "../hooks/useModalFocus";
import {
  createSession,
  deleteSession,
  getAppSettings,
  listSessions,
  patchSession,
} from "../lib/api";
import { shortenReferenceUrl } from "../lib/referenceUrl";
import { formatRelativeTime } from "../lib/format";
import type { SessionSummary } from "../types";

type SessionSort =
  | "updated_desc"
  | "updated_asc"
  | "created_desc"
  | "name_asc";
type DateRange = "all" | "today" | "7d" | "30d";
const SESSION_ROW_ESTIMATED_HEIGHT = 86;
const SESSION_LIST_CHROME_ESTIMATED_HEIGHT = 330;
const SESSION_PAGE_SIZE_MIN = 4;
const SESSION_PAGE_SIZE_MAX = 100;

const SESSION_SORTS: { value: SessionSort; label: string }[] = [
  { value: "updated_desc", label: "Recently updated" },
  { value: "updated_asc", label: "Least recently updated" },
  { value: "created_desc", label: "Newest created" },
  { value: "name_asc", label: "Name A–Z" },
];

const DATE_RANGES: { value: DateRange; label: string }[] = [
  { value: "all", label: "Any date" },
  { value: "today", label: "Updated today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

function isSessionSort(value: string | null): value is SessionSort {
  return SESSION_SORTS.some((option) => option.value === value);
}

function isDateRange(value: string | null): value is DateRange {
  return DATE_RANGES.some((option) => option.value === value);
}

function dateThreshold(range: DateRange): string | null {
  if (range === "all") return null;
  const threshold = new Date();
  if (range === "today") {
    threshold.setHours(0, 0, 0, 0);
  } else {
    threshold.setDate(threshold.getDate() - (range === "7d" ? 7 : 30));
  }
  return threshold.toISOString();
}

function localDateParts(value: string): [number, number, number] | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return [year, month, day];
}

function startOfLocalDateIso(value: string): string | null {
  const parts = localDateParts(value);
  if (!parts) return null;
  const [year, month, day] = parts;
  return new Date(year, month - 1, day, 0, 0, 0, 0).toISOString();
}

function endOfLocalDateIso(value: string): string | null {
  const parts = localDateParts(value);
  if (!parts) return null;
  const [year, month, day] = parts;
  return new Date(year, month - 1, day, 23, 59, 59, 999).toISOString();
}

function laterIso(...values: (string | null)[]): string | null {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
}

function calculateSessionPageLimit(): number {
  const availableHeight = Math.max(
    SESSION_ROW_ESTIMATED_HEIGHT,
    window.innerHeight - SESSION_LIST_CHROME_ESTIMATED_HEIGHT,
  );
  const visibleRows = Math.floor(availableHeight / SESSION_ROW_ESTIMATED_HEIGHT);
  return Math.min(
    Math.max(visibleRows, SESSION_PAGE_SIZE_MIN),
    SESSION_PAGE_SIZE_MAX,
  );
}

function isNearDocumentEnd(): boolean {
  const documentElement = document.documentElement;
  const scrollHeight = Math.max(
    documentElement.scrollHeight,
    document.body?.scrollHeight ?? 0,
  );
  const viewportBottom = window.scrollY + window.innerHeight;
  return scrollHeight <= window.innerHeight + 1 || viewportBottom >= scrollHeight - 160;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest("input, textarea, select, [contenteditable='true']"))
  );
}

export function SessionLibrary() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [sort, setSort] = useState<SessionSort>(() => {
    const value = searchParams.get("sort");
    return isSessionSort(value) ? value : "updated_desc";
  });
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const value = searchParams.get("date");
    return isDateRange(value) ? value : "all";
  });
  const [fromDate, setFromDate] = useState(searchParams.get("from") ?? "");
  const [toDate, setToDate] = useState(searchParams.get("to") ?? "");
  const quickUpdatedAfter = useMemo(() => dateThreshold(dateRange), [dateRange]);
  const customUpdatedAfter = useMemo(
    () => startOfLocalDateIso(fromDate),
    [fromDate],
  );
  const updatedAfter = useMemo(
    () => laterIso(quickUpdatedAfter, customUpdatedAfter),
    [customUpdatedAfter, quickUpdatedAfter],
  );
  const updatedBefore = useMemo(() => endOfLocalDateIso(toDate), [toDate]);
  const dateFilterError = useMemo(() => {
    if (fromDate && !customUpdatedAfter) return "Choose a valid From date.";
    if (toDate && !updatedBefore) return "Choose a valid To date.";
    if (
      customUpdatedAfter &&
      updatedBefore &&
      Date.parse(customUpdatedAfter) > Date.parse(updatedBefore)
    ) {
      return "From date must be on or before To date.";
    }
    return "";
  }, [customUpdatedAfter, fromDate, toDate, updatedBefore]);
  const hasActiveFilters =
    Boolean(query.trim()) ||
    dateRange !== "all" ||
    Boolean(fromDate) ||
    Boolean(toDate);
  const [pageLimit, setPageLimit] = useState(calculateSessionPageLimit);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<SessionSummary | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<SessionSummary | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPath, setSettingsPath] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(
    new Set(),
  );
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const generationRef = useRef(0);
  const hasUserScrolledRef = useRef(false);
  const listControllersRef = useRef(new Set<AbortController>());
  const requestedCursorsRef = useRef(new Set<string>());
  const createMutationIdRef = useRef<string | null>(null);
  const createControllerRef = useRef<AbortController | null>(null);
  const renameControllerRef = useRef<AbortController | null>(null);
  const renameMutationIdsRef = useRef(new Map<string, string>());
  const deleteMutationIdsRef = useRef(new Map<string, string>());
  const deleteControllerRef = useRef<AbortController | null>(null);
  const bulkDeleteControllersRef = useRef(new Set<AbortController>());
  const settingsControllerRef = useRef<AbortController | null>(null);
  const actionButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const dialogReturnFocusRef = useRef<HTMLElement | null>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const renameDialogRef = useModalFocus<HTMLFormElement>({
    active: renameTarget !== null,
    returnFocusRef: dialogReturnFocusRef,
  });
  const deleteDialogRef = useModalFocus<HTMLDivElement>({
    active: deleteTarget !== null,
    returnFocusRef: dialogReturnFocusRef,
  });
  const settingsDialogRef = useModalFocus<HTMLDivElement>({
    active: settingsOpen,
    returnFocusRef: settingsButtonRef,
  });

  const load = useCallback(async (
    nextQuery: string,
    nextCursor: string | null,
    generation: number,
    nextSort: SessionSort,
    nextUpdatedAfter: string | null,
    nextUpdatedBefore: string | null,
    nextLimit: number,
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
        {
          limit: nextLimit,
          sort: nextSort,
          updatedAfter: nextUpdatedAfter,
          updatedBefore: nextUpdatedBefore,
        },
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
      hasUserScrolledRef.current = false;
      setSessions([]);
      setSelectedSessionIds(new Set());
      setCursor(null);
      setLoading(true);
      void load(
        nextQuery,
        null,
        generation,
        sort,
        updatedAfter,
        updatedBefore,
        pageLimit,
      );
    },
    [load, pageLimit, sort, updatedAfter, updatedBefore],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextParams: Record<string, string> = {};
      if (query.trim()) nextParams.q = query.trim();
      if (sort !== "updated_desc") nextParams.sort = sort;
      if (dateRange !== "all") nextParams.date = dateRange;
      if (fromDate) nextParams.from = fromDate;
      if (toDate) nextParams.to = toDate;
      setSearchParams(nextParams, { replace: true });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [dateRange, fromDate, query, setSearchParams, sort, toDate]);

  useEffect(() => {
    generationRef.current += 1;
    for (const controller of listControllersRef.current) controller.abort();
    listControllersRef.current.clear();
    requestedCursorsRef.current.clear();
    hasUserScrolledRef.current = false;
    const generation = generationRef.current;
    if (dateFilterError) {
      queueMicrotask(() => {
        if (generation !== generationRef.current) return;
        setSessions([]);
        setSelectedSessionIds(new Set());
        setCursor(null);
        setLoading(false);
        setError(dateFilterError);
      });
      return;
    }
    queueMicrotask(() => {
      if (generation !== generationRef.current) return;
      setSessions([]);
      setSelectedSessionIds(new Set());
      setCursor(null);
      setLoading(true);
    });
    const timer = window.setTimeout(() => {
      void load(
        query,
        null,
        generation,
        sort,
        updatedAfter,
        updatedBefore,
        pageLimit,
      );
    }, 180);
    return () => window.clearTimeout(timer);
  }, [
    dateFilterError,
    dateRange,
    load,
    pageLimit,
    query,
    sort,
    updatedAfter,
    updatedBefore,
  ]);

  useEffect(() => {
    const handleResize = () => {
      setPageLimit(calculateSessionPageLimit());
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const listControllers = listControllersRef.current;
    const bulkDeleteControllers = bulkDeleteControllersRef.current;
    return () => {
      generationRef.current += 1;
      for (const controller of listControllers) controller.abort();
      createControllerRef.current?.abort();
      renameControllerRef.current?.abort();
      deleteControllerRef.current?.abort();
      for (const controller of bulkDeleteControllers) {
        controller.abort();
      }
      settingsControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const loadNextCursorPage = () => {
      if (!cursor) return;
      void load(
        query,
        cursor,
        generationRef.current,
        sort,
        updatedAfter,
        updatedBefore,
        pageLimit,
      );
    };
    const handleScroll = () => {
      if (window.scrollY > 0) {
        hasUserScrolledRef.current = true;
      }
      if (isNearDocumentEnd()) {
        hasUserScrolledRef.current = true;
        loadNextCursorPage();
      }
    };
    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY <= 0 || !isNearDocumentEnd()) return;
      hasUserScrolledRef.current = true;
      loadNextCursorPage();
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("wheel", handleWheel, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("wheel", handleWheel);
    };
  }, [cursor, load, pageLimit, query, sort, updatedAfter, updatedBefore]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !cursor) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && hasUserScrolledRef.current) {
        void load(
          query,
          cursor,
          generationRef.current,
          sort,
          updatedAfter,
          updatedBefore,
          pageLimit,
        );
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [cursor, load, pageLimit, query, sort, updatedAfter, updatedBefore]);

  const handleCreate = useCallback(async () => {
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
      navigate(`/sessions/${response.session.id}`, {
        state: { focusSessionName: true },
      });
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
  }, [creating, navigate]);

  const toggleSessionSelection = useCallback((id: string) => {
    setSelectedSessionIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAllSessions = useCallback(() => {
    const allIds = new Set(sessions.map((session) => session.id));
    setSelectedSessionIds(allIds);
  }, [sessions]);

  const deselectAllSessions = useCallback(() => {
    setSelectedSessionIds(new Set());
  }, []);

  const isAllSelected = useMemo(() => {
    return (
      sessions.length > 0 &&
      sessions.every((session) => selectedSessionIds.has(session.id))
    );
  }, [sessions, selectedSessionIds]);

  const toggleSelectAll = useCallback(() => {
    if (isAllSelected) {
      deselectAllSessions();
    } else {
      selectAllSessions();
    }
  }, [isAllSelected, selectAllSessions, deselectAllSessions]);

  useEffect(() => {
    const handleDashboardShortcut = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isEditableTarget(event.target)
      ) {
        return;
      }
      if (event.key === "/") {
        event.preventDefault();
        searchInputRef.current?.focus();
      } else if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        void handleCreate();
      }
    };
    window.addEventListener("keydown", handleDashboardShortcut);
    return () =>
      window.removeEventListener("keydown", handleDashboardShortcut);
  }, [handleCreate]);

  const openSettings = async () => {
    if (settingsControllerRef.current) return;
    setSettingsOpen(true);
    setSettingsLoading(true);
    setSettingsError("");
    const controller = new AbortController();
    settingsControllerRef.current = controller;
    try {
      const response = await getAppSettings(controller.signal);
      setSettingsPath(response.data_path);
    } catch (settingsLoadError) {
      if (controller.signal.aborted) return;
      setSettingsError(
        settingsLoadError instanceof Error
          ? settingsLoadError.message
          : "Could not load the data path.",
      );
    } finally {
      if (settingsControllerRef.current === controller) {
        settingsControllerRef.current = null;
        setSettingsLoading(false);
      }
    }
  };

  const closeSettings = () => {
    settingsControllerRef.current?.abort();
    settingsControllerRef.current = null;
    setSettingsLoading(false);
    setSettingsOpen(false);
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

  const handleBulkDelete = useCallback(async () => {
    if (selectedSessionIds.size === 0 || bulkDeleting) return;
    const selectedSessions = sessions.filter((session) =>
      selectedSessionIds.has(session.id),
    );
    if (selectedSessions.length === 0) {
      setSelectedSessionIds(new Set());
      return;
    }
    if (
      !window.confirm(
        `Are you sure you want to delete ${selectedSessions.length} session(s)?`,
      )
    ) {
      return;
    }

    setBulkDeleting(true);
    const deletedIds = new Set<string>();
    let errorCount = 0;

    try {
      for (const session of selectedSessions) {
        const operationKey = `${session.id}:${session.revision}`;
        const mutationId =
          deleteMutationIdsRef.current.get(operationKey) ?? crypto.randomUUID();
        deleteMutationIdsRef.current.set(operationKey, mutationId);
        const controller = new AbortController();
        bulkDeleteControllersRef.current.add(controller);
        try {
          await deleteSession(
            session.id,
            session.revision,
            mutationId,
            controller.signal,
          );
          deleteMutationIdsRef.current.delete(operationKey);
          deletedIds.add(session.id);
        } catch {
          if (controller.signal.aborted) break;
          errorCount++;
        } finally {
          bulkDeleteControllersRef.current.delete(controller);
        }
      }

      if (deletedIds.size > 0) {
        setSessions((current) =>
          current.filter((session) => !deletedIds.has(session.id)),
        );
        setSelectedSessionIds((current) => {
          const remaining = new Set(current);
          for (const id of deletedIds) remaining.delete(id);
          return remaining;
        });
      }
      if (errorCount > 0) {
        setError(`Some sessions could not be deleted. ${errorCount} failed.`);
      }
    } finally {
      setBulkDeleting(false);
    }
  }, [bulkDeleting, selectedSessionIds, sessions]);

  return (
    <AppShell
      actions={
        <>
          <button
            ref={settingsButtonRef}
            className="secondary-button"
            type="button"
            onClick={() => void openSettings()}
          >
            <Settings2 size={16} />
            Settings
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={handleCreate}
            disabled={creating}
            aria-keyshortcuts="N"
            title="New session (N)"
          >
            <Plus size={17} />
            {creating ? "Creating…" : "New session"}
          </button>
        </>
      }
    >
      <main className="library">
        <section className="session-section">
          <div className="session-heading">
            <div>
              <span className="eyebrow">Workspace</span>
              <h1>Sessions</h1>
              <p>Search, sort, and resume your saved Python work.</p>
            </div>
            <span className="session-count">
              {sessions.length} loaded
            </span>
          </div>
          <div className="session-toolbar">
            <label className="search-field">
              <Search size={17} />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search names or tags"
                aria-label="Search sessions by name or tag"
                aria-keyshortcuts="/"
              />
              <kbd>/</kbd>
            </label>
            <label className="session-select">
              <Clock3 size={15} />
              <span className="sr-only">Order sessions</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as SessionSort)}
                aria-label="Order sessions"
              >
                {SESSION_SORTS.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="session-select">
              <CalendarDays size={15} />
              <span className="sr-only">Filter by updated date</span>
              <select
                value={dateRange}
                onChange={(event) =>
                  setDateRange(event.target.value as DateRange)
                }
                aria-label="Filter by updated date"
              >
                {DATE_RANGES.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="session-date-field">
              <span>From</span>
              <input
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
                aria-label="Updated from date"
              />
            </label>
            <label className="session-date-field">
              <span>To</span>
              <input
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
                aria-label="Updated to date"
              />
            </label>
            {(dateRange !== "all" || fromDate || toDate) && (
              <button
                className="ghost-button ghost-button--small"
                type="button"
                onClick={() => {
                  setDateRange("all");
                  setFromDate("");
                  setToDate("");
                }}
              >
                Clear dates
              </button>
            )}
          </div>

          {error && <div className="inline-error">{error}</div>}

          {loading && sessions.length === 0 ? (
            <div className="session-list" aria-label="Loading sessions">
              {[0, 1, 2, 3].map((item) => (
                <div className="session-row session-row--skeleton" key={item} />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">
                <Code2 size={27} />
              </span>
              <h3>
                {hasActiveFilters
                  ? "No matching sessions"
                  : "No sessions yet"}
              </h3>
              <p>
                {hasActiveFilters
                  ? "Change the search or date filter and try again."
                  : "Create a session to start writing Python."}
              </p>
              <button className="primary-button" type="button" onClick={handleCreate}>
                <Plus size={17} />
                Create a session
              </button>
            </div>
          ) : (
            <>
              {selectedSessionIds.size > 0 && (
                <div className="bulk-actions-toolbar">
                  <span>{selectedSessionIds.size} session(s) selected</span>
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => void handleBulkDelete()}
                    disabled={bulkDeleting}
                  >
                    {bulkDeleting ? "Deleting…" : "Delete Selected"}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={deselectAllSessions}
                    disabled={bulkDeleting}
                  >
                    Clear Selection
                  </button>
                </div>
              )}
              <div className="session-list" role="table" aria-label="Sessions">
              <div className="session-list-header" role="row">
                <span className="session-row-checkbox" role="columnheader">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={toggleSelectAll}
                    aria-label={isAllSelected ? "Deselect all sessions" : "Select all sessions"}
                  />
                </span>
                <span role="columnheader">Session</span>
                <span role="columnheader">Updated</span>
                <span role="columnheader">Created</span>
                <span role="columnheader">Actions</span>
              </div>
              {sessions.map((session) => (
                <article className="session-row" role="row" key={session.id}>
                  <div className="session-row-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedSessionIds.has(session.id)}
                      onChange={() => toggleSessionSelection(session.id)}
                      aria-label={`Select session ${session.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    />
                  </div>
                  <div className="session-row-main-wrapper">
                    <button
                      className="session-row-main"
                      type="button"
                      onClick={() => navigate(`/sessions/${session.id}`)}
                    >
                      <span className="session-identity">
                        <span className="file-badge">PY</span>
                        <span className="session-copy">
                          <strong>{session.name}</strong>
                          <span className="session-subline">
                            <code>
                              {session.code_preview || "# Empty session"}
                            </code>
                            {session.tags.length > 0 && (
                              <span
                                className="session-tags"
                                aria-label={`Tags: ${session.tags.join(", ")}`}
                              >
                                {session.tags.map((tag) => (
                                  <span className="session-tag" key={tag}>
                                    {tag}
                                  </span>
                                ))}
                              </span>
                            )}
                          </span>
                        </span>
                      </span>
                      <time
                        className="session-date"
                        dateTime={session.updated_at}
                        title={new Date(session.updated_at).toLocaleString()}
                      >
                        <strong>{formatRelativeTime(session.updated_at)}</strong>
                        <span>{formatDate(session.updated_at)}</span>
                      </time>
                      <time
                        className="session-date"
                        dateTime={session.created_at}
                        title={new Date(session.created_at).toLocaleString()}
                      >
                        <strong>{formatDate(session.created_at)}</strong>
                        <span>Created</span>
                      </time>
                    </button>
                    {session.ref_url && (
                      <a
                        className="session-ref-link"
                        href={session.ref_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={session.ref_url}
                        aria-label={`Reference: ${session.ref_url}`}
                      >
                        <ExternalLink size={11} />
                        Reference · {shortenReferenceUrl(session.ref_url, 44)}
                      </a>
                    )}
                  </div>
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
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent triggering row click when clicking menu
                        setMenuId((current) =>
                          current === session.id ? null : session.id,
                        )
                      }}
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
                          onClick={(event) => {
                            event.stopPropagation();
                            openDelete(session);
                          }}
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
          </>)}
          <div ref={sentinelRef} className="pagination-sentinel">
            {cursor ? "Scroll for more…" : sessions.length ? "You’re all caught up." : ""}
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
      {settingsOpen && (
        <div className="dialog-backdrop" role="presentation">
          <div
            ref={settingsDialogRef}
            className="dialog settings-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            tabIndex={-1}
          >
            <span className="dialog-icon">
              <Database size={20} />
            </span>
            <div>
              <span className="eyebrow">Application settings</span>
              <h2 id="settings-title">Data storage</h2>
              <p>
                CodeBro saves session names and Python source in this SQLite
                database.
              </p>
              {settingsLoading ? (
                <div className="settings-path-status">Loading data path…</div>
              ) : settingsError ? (
                <div className="inline-error settings-path-status">
                  {settingsError}
                </div>
              ) : (
                <input
                  className="settings-path-input"
                  aria-label="Data storage path"
                  value={settingsPath}
                  readOnly
                />
              )}
            </div>
            <div className="dialog-actions">
              <button
                className="primary-button"
                type="button"
                onClick={closeSettings}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
