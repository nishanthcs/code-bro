import { bootstrap } from "./bootstrap";
import type {
  ApiErrorBody,
  MutationResponse,
  SessionListResponse,
  SessionResource,
} from "../types";

const REQUEST_TIMEOUT_MS = 10_000;
const HEALTH_TIMEOUT_MS = 2_500;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorBody,
  ) {
    super(body.error.message);
  }
}

export function checkHealth(signal?: AbortSignal): Promise<{ status: string }> {
  return request("/api/v1/health", { signal }, HEALTH_TIMEOUT_MS);
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<T> {
  const timeoutController = new AbortController();
  const timeout = globalThis.setTimeout(() => {
    timeoutController.abort(
      new DOMException("Request timed out.", "TimeoutError"),
    );
  }, timeoutMs);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeoutController.signal])
    : timeoutController.signal;
  try {
    const response = await fetch(path, {
      ...init,
      signal,
      headers: {
        "X-CodeBro-Token": bootstrap.apiToken,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    if (!response.ok) {
      let body: ApiErrorBody;
      try {
        body = (await response.json()) as ApiErrorBody;
      } catch {
        body = {
          error: {
            code: "request_failed",
            message: `Request failed with status ${response.status}.`,
            details: {},
          },
        };
      }
      throw new ApiError(response.status, body);
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export function listSessions(
  query: string,
  cursor?: string | null,
  signal?: AbortSignal,
): Promise<SessionListResponse> {
  const params = new URLSearchParams({ limit: "50" });
  if (query.trim()) params.set("q", query.trim());
  if (cursor) params.set("cursor", cursor);
  return request(`/api/v1/sessions?${params.toString()}`, { signal });
}

export function getSession(
  id: string,
  signal?: AbortSignal,
): Promise<SessionResource> {
  return request(`/api/v1/sessions/${id}`, { signal });
}

export function createSession(
  mutationId: string,
  signal?: AbortSignal,
): Promise<MutationResponse> {
  return request("/api/v1/sessions", {
    method: "POST",
    signal,
    body: JSON.stringify({
      name: "Untitled Session",
      code: 'print("Hello, world!")\n',
      mutation_id: mutationId,
    }),
  });
}

export function patchSession(
  id: string,
  payload: {
    name?: string;
    code?: string;
    expected_revision: number;
    mutation_id: string;
  },
  signal?: AbortSignal,
): Promise<MutationResponse> {
  return request(`/api/v1/sessions/${id}`, {
    method: "PATCH",
    signal,
    body: JSON.stringify(payload),
  });
}

export function deleteSession(
  id: string,
  revision: number,
  mutationId: string,
  signal?: AbortSignal,
): Promise<void> {
  return request(`/api/v1/sessions/${id}`, {
    method: "DELETE",
    signal,
    body: JSON.stringify({
      expected_revision: revision,
      mutation_id: mutationId,
    }),
  });
}
