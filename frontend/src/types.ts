export interface SessionResource {
  id: string;
  name: string;
  code: string;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface SessionSummary {
  id: string;
  name: string;
  code_preview: string;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface SessionListResponse {
  items: SessionSummary[];
  next_cursor: string | null;
}

export interface MutationMeta {
  mutation_id: string;
  applied_revision: number;
  duplicate: boolean;
  superseded: boolean;
}

export interface MutationResponse {
  session: SessionResource;
  mutation: MutationMeta;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details: Record<string, unknown> & { session?: SessionResource };
  };
}

export type SaveStatus = "saved" | "scheduled" | "saving" | "failed" | "conflict";
export type RunStatus =
  | "loading"
  | "ready"
  | "running"
  | "resetting"
  | "completed"
  | "failed"
  | "stopped"
  | "timed-out";

export interface OutputFragment {
  sequence: number;
  stream: "stdout" | "stderr" | "system";
  text: string;
}

