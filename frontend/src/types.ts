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
  | "debug-running"
  | "debug-paused"
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

export interface DebugVariable {
  name: string;
  scope: "local" | "global";
  typeName: string;
  preview: string;
  editable: boolean;
  truncated: boolean;
}

export interface DebugScope {
  name: string;
  variables: DebugVariable[];
  expensive: boolean;
}

export interface DebugStackFrame {
  id: string;
  function: string;
  file: string;
  line: number;
}

export interface DebugPausedInfo {
  debugId: string;
  pauseId: string;
  reason: "entry" | "breakpoint" | "step" | "pause";
  location: {
    file: string;
    line: number;
  };
  stack: DebugStackFrame[];
  scopes: DebugScope[];
}

export type DebugCommand =
  | { type: "continue" }
  | { type: "step-in" }
  | { type: "step-over" }
  | { type: "step-out" }
  | { type: "stop" }
  | { type: "update-breakpoints"; breakpoints: number[] }
  | { type: "set-variable"; pauseId: string; frameId: string; scope: "local" | "global"; name: string; literal: string };
