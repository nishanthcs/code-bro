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
import { Compartment, EditorSelection, EditorState, RangeSet, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  gutter,
  GutterMarker,
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

class BreakpointMarker extends GutterMarker {
  constructor(readonly line: number) {
    super();
  }
  toDOM() {
    const mark = document.createElement("div");
    mark.className = "cm-breakpoint-marker";
    mark.setAttribute("aria-label", `Breakpoint at line ${this.line}`);
    return mark;
  }
}

class BreakpointSpacer extends GutterMarker {
  toDOM() {
    const spacer = document.createElement("div");
    spacer.className = "cm-breakpoint-spacer";
    spacer.setAttribute("aria-hidden", "true");
    return spacer;
  }
}

const setBreakpointsEffect = StateEffect.define<Set<number>>();

const breakpointsField = StateField.define<RangeSet<BreakpointMarker>>({
  create() { return RangeSet.empty; },
  update(markers, tr) {
    markers = markers.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setBreakpointsEffect)) {
        const items = [];
        for (const line of effect.value) {
          if (line <= tr.state.doc.lines) {
            const lineObj = tr.state.doc.line(line);
            items.push(new BreakpointMarker(line).range(lineObj.from));
          }
        }
        items.sort((a, b) => a.from - b.from);
        markers = RangeSet.of(items, true);
      }
    }
    return markers;
  }
});

const debugLineTheme = EditorView.baseTheme({
  ".cm-debug-line": {
    backgroundColor: "var(--cm-debug-line-bg, rgba(255, 200, 50, 0.2))",
  },
  ".cm-debug-line-gutter": {
    backgroundColor: "var(--cm-debug-line-gutter-bg, rgba(255, 200, 50, 0.4))",
  },
  ".cm-breakpoint-gutter": {
    width: "18px",
    minWidth: "18px",
    borderRight: "1px solid var(--cm-breakpoint-gutter-border, rgba(148, 163, 184, 0.18))",
    cursor: "pointer",
  },
  ".cm-breakpoint-gutter .cm-gutterElement": {
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "18px",
    width: "18px",
    padding: "0",
  },
  ".cm-breakpoint-gutter .cm-gutterElement:hover": {
    backgroundColor: "var(--cm-breakpoint-gutter-hover, rgba(239, 68, 68, 0.08))",
  },
  ".cm-breakpoint-gutter .cm-gutterElement:hover::before": {
    content: "''",
    width: "6px",
    height: "6px",
    borderRadius: "999px",
    border: "1px solid var(--cm-breakpoint-color, #e53935)",
    opacity: "0.55",
  },
  ".cm-breakpoint-marker": {
    boxSizing: "border-box",
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    backgroundColor: "var(--cm-breakpoint-color, #e53935)",
    boxShadow: "0 0 0 2px var(--cm-breakpoint-ring, rgba(229, 57, 53, 0.18))",
    cursor: "pointer",
  },
  ".cm-breakpoint-spacer": {
    width: "10px",
    height: "10px",
  },
});

export function CodeEditor({
  value,
  sessionId,
  onChange,
  onRun,
  resetToken = 0,
  readOnly = false,
  breakpoints = new Set(),
  currentDebugLine = null,
  onToggleBreakpoint,
}: {
  value: string;
  sessionId: string;
  onChange: (value: string) => void;
  onRun: () => void;
  resetToken?: number;
  readOnly?: boolean;
  breakpoints?: Set<number>;
  currentDebugLine?: number | null;
  onToggleBreakpoint?: (line: number) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const readOnlyCompartment = useRef(new Compartment());
  const debugLineCompartment = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const onRunRef = useRef(onRun);
  const onToggleBpRef = useRef(onToggleBreakpoint);
  const resetTokenRef = useRef(resetToken);
  const resettingRef = useRef(false);
  const { theme, editorTheme } = useTheme();

  useEffect(() => {
    onChangeRef.current = onChange;
    onRunRef.current = onRun;
    onToggleBpRef.current = onToggleBreakpoint;
  }, [onChange, onRun, onToggleBreakpoint]);

  useEffect(() => {
    if (!rootRef.current) return;
    const initialCursor = initialEditorCursor(sessionId, value.length);

    const breakpointGutter = gutter({
      class: "cm-breakpoint-gutter",
      markers(view) {
        return view.state.field(breakpointsField);
      },
      initialSpacer: () => new BreakpointSpacer(),
      domEventHandlers: {
        mousedown(view, block, event) {
          event.preventDefault();
          const line = view.state.doc.lineAt(block.from).number;
          onToggleBpRef.current?.(line);
          return true;
        },
      },
    });

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
          breakpointsField,
          breakpointGutter,
          highlightActiveLineGutter(),
          history(),
          highlightActiveLine(),
          python(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          indentUnit.of("    "),
          EditorState.tabSize.of(4),
          debugLineTheme,
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
          readOnlyCompartment.current.of(EditorState.readOnly.of(readOnly)),
          debugLineCompartment.current.of(
            EditorView.decorations.of(Decoration.none),
          ),
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

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyCompartment.current.reconfigure(
        EditorState.readOnly.of(readOnly),
      ),
    });
  }, [readOnly]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: setBreakpointsEffect.of(breakpoints),
    });
  }, [breakpoints]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (
      currentDebugLine !== null &&
      currentDebugLine >= 1 &&
      currentDebugLine <= view.state.doc.lines
    ) {
      const line = view.state.doc.line(currentDebugLine);
      const debugLineDeco = Decoration.line({ attributes: { class: "cm-debug-line" } });
      const decoSet = Decoration.set([debugLineDeco.range(line.from)]);
      view.dispatch({
        effects: debugLineCompartment.current.reconfigure(
          EditorView.decorations.of(decoSet),
        ),
        selection: { anchor: line.from },
      });
    } else {
      view.dispatch({
        effects: debugLineCompartment.current.reconfigure(
          EditorView.decorations.of(Decoration.none),
        ),
      });
    }
  }, [currentDebugLine]);

  return <div ref={rootRef} className="code-editor" />;
}
