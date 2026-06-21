import {
  history,
  historyKeymap,
  indentWithTab,
  insertNewlineAndIndent,
  temporarilySetTabFocusMode,
  toggleComment,
  toggleTabFocusMode,
} from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import {
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { searchKeymap } from "@codemirror/search";
import { Compartment, EditorSelection, EditorState } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { useEffect, useRef } from "react";
import { resolveEditorTheme } from "../lib/editorThemes";
import {
  initialEditorCursor,
  persistEditorCursor,
} from "../lib/preferences";
import { useTheme } from "./ThemeProvider";

export function CodeEditor({
  value,
  sessionId,
  onChange,
  onRun,
  resetToken = 0,
}: {
  value: string;
  sessionId: string;
  onChange: (value: string) => void;
  onRun: () => void;
  resetToken?: number;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const onRunRef = useRef(onRun);
  const resetTokenRef = useRef(resetToken);
  const resettingRef = useRef(false);
  const { theme, editorTheme } = useTheme();

  useEffect(() => {
    onChangeRef.current = onChange;
    onRunRef.current = onRun;
  }, [onChange, onRun]);

  useEffect(() => {
    if (!rootRef.current) return;
    const initialCursor = initialEditorCursor(sessionId, value.length);
    const view = new EditorView({
      parent: rootRef.current,
      state: EditorState.create({
        doc: value,
        selection: EditorSelection.create([
          EditorSelection.range(
            initialCursor.anchor,
            initialCursor.head,
          ),
        ]),
        extensions: [
          lineNumbers(),
          foldGutter({
            openText: "⌄",
            closedText: "›",
          }),
          highlightActiveLineGutter(),
          history(),
          highlightActiveLine(),
          python(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          indentUnit.of("    "),
          EditorState.tabSize.of(4),
          keymap.of([
            ...historyKeymap,
            ...searchKeymap,
            ...foldKeymap,
            indentWithTab,
            {
              key: "Enter",
              run: insertNewlineAndIndent,
            },
            {
              key: "Mod-/",
              run: toggleComment,
            },
            {
              key: "Escape",
              run: temporarilySetTabFocusMode,
            },
            {
              key: "Ctrl-m",
              mac: "Shift-Alt-m",
              run: toggleTabFocusMode,
            },
            {
              key: "Mod-Enter",
              run: () => {
                onRunRef.current();
                return true;
              },
            },
          ]),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({
            "aria-label": "Python code editor",
            spellcheck: "false",
            autocapitalize: "off",
            autocorrect: "off",
            "data-gramm": "false",
            "data-gramm_editor": "false",
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !resettingRef.current) {
              onChangeRef.current(update.state.doc.toString());
            }
            if (update.selectionSet || update.docChanged) {
              const selection = update.state.selection.main;
              persistEditorCursor(sessionId, {
                anchor: selection.anchor,
                head: selection.head,
              });
            }
          }),
          themeCompartment.current.of(resolveEditorTheme(editorTheme, theme)),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // The editor owns its document after initialization.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (resetTokenRef.current === resetToken) return;
    resetTokenRef.current = resetToken;
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    resettingRef.current = true;
    try {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    } finally {
      resettingRef.current = false;
    }
  }, [resetToken, value]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeCompartment.current.reconfigure(
        resolveEditorTheme(editorTheme, theme),
      ),
    });
  }, [editorTheme, theme]);

  return <div ref={rootRef} className="code-editor" />;
}
