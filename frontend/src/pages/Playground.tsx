import { useState } from "react";
import { useAutosave } from "../hooks/useAutosave";
import { CodeEditor } from "../components/CodeEditor";
import { RunnerPanel } from "../components/RunnerPanel";
import { ServerStatusBanner } from "../components/ServerStatusBanner";

interface PlaygroundProps {
  session: any;
}

export function Playground({ session }: PlaygroundProps) {
  const autosave = useAutosave(session);
  const [editorResetToken, setEditorResetToken] = useState(0);

  return (
    <div className="playground">
      <ServerStatusBanner />
      
      <div className="workspace">
        <div className="editor-container">
          <CodeEditor
            key={session.id}
            value={autosave.draft.code}
            onChange={(code) => autosave.setDraft((current) => ({ ...current, code }))}
            resetToken={editorResetToken}
          />
        </div>
        
        <div className="runner-container">
          <RunnerPanel />
        </div>
      </div>
    </div>
  );
}
