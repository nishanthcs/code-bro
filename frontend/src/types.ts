export interface SessionResource {
  id: string;
  name: string;
  code: string;
  tags: string[];
  revision: number;
  created_at: string;
  updated_at: string;
  ref_url: string | null;
  notes_markdown: string;
}

export interface SessionSummary {
  id: string;
  name: string;
  code_preview: string;
  tags: string[];
  revision: number;
  created_at: string;
  updated_at: string;
  ref_url: string | null;
}

export interface SessionListResponse {
  items: SessionSummary[];
  next_cursor: string | null;
}

export interface AppSettings {
  data_path: string;
}

export interface MutationMeta {
  mutation_id: string;
  applied_revision: number;
  duplicate: boolean;
  superseded: boolean;
  auto_tags_added: string[];
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
