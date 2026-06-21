import { history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import {
  defaultHighlightStyle,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { searchKeymap } from "@codemirror/search";
import { Compartment, EditorState } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { useEffect, useRef } from "react";
import { resolveEditorTheme } from "../lib/editorThemes";
import { useTheme } from "./ThemeProvider";

export function CodeEditor({
  value,
  onChange,
  onRun,
  resetToken = 0,
}: {
  value: string;
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
  const { theme, editorTheme } = useTheme();

  useEffect(() => {
    onChangeRef.current = onChange;
    onRunRef.current = onRun;
  }, [onChange, onRun]);

  useEffect(() => {
    if (!rootRef.current) return;
    const view = new EditorView({
      parent: rootRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          history(),
          drawSelection(),
          highlightActiveLine(),
          python(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          indentUnit.of("    "),
          EditorState.tabSize.of(4),
          keymap.of([
            ...historyKeymap,
            ...searchKeymap,
            indentWithTab,
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
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
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
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    });
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
