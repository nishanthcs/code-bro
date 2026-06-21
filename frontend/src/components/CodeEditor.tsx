import { useEffect, useRef } from "react";
import { useTheme } from "../hooks/useTheme";

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  onRun?: () => void;
  resetToken?: number;
}

export function CodeEditor({ value, onChange, onRun, resetToken }: CodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  useEffect(() => {
    if (textareaRef.current) {
      // Reset the textarea content when resetToken changes
      textareaRef.current.value = value;
    }
  }, [resetToken, value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle save shortcut (Cmd+S or Ctrl+S)
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      // In a real app, this would trigger a save action
      console.log("Save triggered");
    }
    
    // Handle comment/uncomment shortcut (Cmd+/ or Ctrl+/)
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      e.preventDefault();
      
      const textarea = textareaRef.current;
      if (!textarea) return;
      
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selectedText = value.substring(start, end);
      
      // Get the line boundaries
      const lines = value.substring(0, start).split('\n');
      const lineStart = lines.length - 1;
      const lineEnd = value.substring(0, end).split('\n').length - 1;
      
      // For multiple lines, we'll comment/uncomment each line
      if (lineStart !== lineEnd) {
        // Handle multi-line selection
        const linesArray = value.split('\n');
        let newLines = [...linesArray];
        
        for (let i = lineStart; i <= lineEnd; i++) {
          const line = linesArray[i];
          if (line.trim().startsWith('#')) {
            // Uncomment the line
            newLines[i] = line.replace(/^(\s*)#(\s*)/, '$1');
          } else {
            // Comment the line
            newLines[i] = `${line.substring(0, 0)}#${line.substring(0)}`;
          }
        }
        
        const newValue = newLines.join('\n');
        onChange(newValue);
      } else {
        // Handle single line selection
        const lineStartIndex = value.lastIndexOf('\n', start - 1) + 1;
        const lineEndIndex = value.indexOf('\n', start);
        const lineEndPos = lineEndIndex === -1 ? value.length : lineEndIndex;
        
        const line = value.substring(lineStartIndex, lineEndPos);
        if (line.trim().startsWith('#')) {
          // Uncomment the line
          const newValue = value.substring(0, lineStartIndex) + 
                          line.replace(/^(\s*)#(\s*)/, '$1') + 
                          value.substring(lineEndPos);
          onChange(newValue);
        } else {
          // Comment the line
          const newValue = value.substring(0, lineStartIndex) + 
                          `#${line}` + 
                          value.substring(lineEndPos);
          onChange(newValue);
        }
      }
    }
  };

  return (
    <div className="code-editor-container">
      <textarea
        ref={textareaRef}
        className="code-editor"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        spellCheck="false"
      />
    </div>
  );
}
