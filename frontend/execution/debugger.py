import sys
import json
from types import FrameType
from typing import Any, Optional

MAX_VARIABLES_PER_SCOPE = 100
MAX_PREVIEW_CHARS = 120


class CodeBroDebugger:
    def __init__(self):
        self.reset()

    def reset(self):
        self.active = True
        self.breakpoints: set = set()
        self.step_mode: Optional[str] = None
        self.target_depth: int = 0
        self.stop_requested: bool = False
        self.first_line: bool = True
        self._command_bridge = None

    def set_command_bridge(self, bridge):
        self._command_bridge = bridge

    def _get_depth(self, frame: FrameType) -> int:
        depth = 0
        f = frame
        while f:
            depth += 1
            f = f.f_back
        return depth

    def _safe_preview(self, value: Any) -> str:
        try:
            if value is None:
                return "None"
            if isinstance(value, bool):
                return "True" if value else "False"
            if isinstance(value, (int, float, complex)):
                return repr(value)
            if isinstance(value, str):
                if len(value) > MAX_PREVIEW_CHARS:
                    return repr(value[: MAX_PREVIEW_CHARS - 3] + "...")
                return repr(value)
            if isinstance(value, bytes):
                s = repr(value)
                if len(s) > MAX_PREVIEW_CHARS:
                    return s[: MAX_PREVIEW_CHARS - 3] + "..."
                return s
            if isinstance(value, (list, tuple, set, frozenset, dict)):
                s = repr(value)
                if len(s) > MAX_PREVIEW_CHARS:
                    s = s[: MAX_PREVIEW_CHARS - 3] + "..."
                return s
            return f"<{type(value).__name__} object>"
        except Exception:
            return "<unrepresentable>"

    def _is_visible_name(self, name: str) -> bool:
        return (
            not name.startswith("__")
            and name
            not in {
                "__builtins__",
                "builtins",
                "sys",
                "io",
                "json",
                "codebro_debugger",
                "debugger",
            }
        )

    def _is_editable(self, name: str, value: Any) -> bool:
        return (
            self._is_visible_name(name)
            and name.isidentifier()
            and not name.startswith("_")
            and type(value).__name__ != "module"
        )

    def _build_variable(self, name: str, value: Any, scope: str) -> dict:
        preview = self._safe_preview(value)
        return {
            "name": name,
            "scope": scope,
            "typeName": type(value).__name__,
            "preview": preview,
            "editable": self._is_editable(name, value),
            "truncated": len(preview) >= MAX_PREVIEW_CHARS,
        }

    def _build_scopes(self, frame: FrameType) -> list:
        locals_list = []
        globals_list = []
        for name, value in sorted(frame.f_locals.items()):
            if not self._is_visible_name(name):
                continue
            try:
                locals_list.append(self._build_variable(name, value, "local"))
            except Exception:
                pass
            if len(locals_list) >= MAX_VARIABLES_PER_SCOPE:
                break
        for name, value in sorted(frame.f_globals.items()):
            if not self._is_visible_name(name):
                continue
            if name in frame.f_locals:
                continue
            try:
                globals_list.append(self._build_variable(name, value, "global"))
            except Exception:
                pass
            if len(globals_list) >= MAX_VARIABLES_PER_SCOPE:
                break
        return [
            {"name": "local", "variables": locals_list, "expensive": False},
            {"name": "global", "variables": globals_list, "expensive": False},
        ]

    def _build_stack(self, frame: FrameType) -> list:
        stack = []
        f = frame
        while f:
            stack.append({
                "id": str(id(f)),
                "function": f.f_code.co_name,
                "file": f.f_code.co_filename,
                "line": f.f_lineno,
            })
            f = f.f_back
        return stack

    def _build_pause_info(self, frame: FrameType, selected_frame: FrameType, reason: str) -> str:
        info = {
            "reason": reason,
            "location": {
                "file": "main.py",
                "line": selected_frame.f_lineno,
            },
            "stack": self._build_stack(frame),
            "scopes": self._build_scopes(selected_frame),
        }
        return json.dumps(info)

    def _set_variable(self, frame: FrameType, cmd: dict) -> tuple[bool, str]:
        import ast
        name = cmd.get("name")
        scope = cmd.get("scope")
        literal = cmd.get("literal")
        frame_id = cmd.get("frameId")
        
        if not name or not name.isidentifier():
            return False, f"'{name}' is not a valid Python identifier."
            
        if not self._is_visible_name(name) or name.startswith("_"):
            return False, f"Variable '{name}' is read-only or protected."
            
        try:
            val = ast.literal_eval(literal)
        except Exception as e:
            return False, f"Failed to parse literal expression: {e}"
            
        target_frame = None
        f = frame
        while f:
            if str(id(f)) == frame_id:
                target_frame = f
                break
            f = f.f_back
            
        if not target_frame:
            return False, "Could not find stack frame."
            
        if scope == "global":
            target_frame.f_globals[name] = val
            return True, ""
        if target_frame.f_code.co_name == "<module>":
            target_frame.f_locals[name] = val
            target_frame.f_globals[name] = val
            return True, ""
        else:
            target_frame.f_locals[name] = val
            try:
                import ctypes
                ctypes.pythonapi.PyFrame_LocalsToFast(ctypes.py_object(target_frame), ctypes.c_int(0))
            except Exception:
                pass
            return True, ""

    def _do_pause(self, frame: FrameType, reason: str):
        if not self._command_bridge:
            self.step_mode = None
            return self.trace_func

        self.selected_frame_id = str(id(frame))
        current_reason = reason
        while True:
            # Find selected frame
            selected_frame = frame
            f = frame
            while f:
                if str(id(f)) == self.selected_frame_id:
                    selected_frame = f
                    break
                f = f.f_back
                
            pause_json = self._build_pause_info(frame, selected_frame, current_reason)
            result_json = self._command_bridge(pause_json)
            
            try:
                cmd = json.loads(result_json)
            except Exception:
                cmd = {"type": "continue"}
                
            cmd_type = cmd.get("type", "continue")
            
            if cmd_type == "set-variable":
                success, err_msg = self._set_variable(frame, cmd)
                if not success:
                    import codebro_debugger
                    codebro_debugger.report_command_failed(cmd.get("commandId", ""), err_msg)
                else:
                    current_reason = "pause"
                continue

            elif cmd_type == "invalid-command":
                import codebro_debugger
                codebro_debugger.report_command_failed(
                    cmd.get("commandId", ""),
                    cmd.get("message", "Debugger command was invalid."),
                )
                continue
                
            elif cmd_type == "select-frame":
                frame_id = cmd.get("frameId")
                # Validate frame_id
                f = frame
                found = False
                while f:
                    if str(id(f)) == frame_id:
                        found = True
                        break
                    f = f.f_back
                if found:
                    self.selected_frame_id = frame_id
                continue
                
            elif cmd_type == "update-breakpoints":
                self.breakpoints = set(cmd.get("breakpoints", []))
                continue
                
            else:
                # Basic execution commands (continue, step-over, step-in, step-out, stop)
                t = cmd_type
                if t == "continue":
                    self.step_mode = None
                elif t == "step-in":
                    self.step_mode = "in"
                elif t == "step-over":
                    self.step_mode = "over"
                    depth = self._get_depth(frame)
                    self.target_depth = depth
                elif t == "step-out":
                    self.step_mode = "out"
                    self.target_depth = self._get_depth(frame)
                elif t == "stop":
                    self.stop_requested = True
                    raise CodeBroDebuggerStopped()
                break
                
        return self.trace_func

    def trace_func(self, frame: FrameType, event: str, arg: Any) -> Optional[callable]:
        if not self.active or self.stop_requested:
            return None

        filename = frame.f_code.co_filename
        is_user_code = filename.endswith("main.py")

        if event == "line":
            if not is_user_code:
                return self.trace_func

            lineno = frame.f_lineno
            should_pause = False
            reason = None

            if self.first_line:
                self.first_line = False
                should_pause = True
                reason = "entry"

            if not should_pause and lineno in self.breakpoints:
                should_pause = True
                reason = "breakpoint"

            if not should_pause and self.step_mode:
                if self.step_mode == "over":
                    depth = self._get_depth(frame)
                    if depth <= self.target_depth:
                        should_pause = True
                        reason = "step"
                elif self.step_mode == "in":
                    should_pause = True
                    reason = "step"
                elif self.step_mode == "out":
                    depth = self._get_depth(frame)
                    if depth < self.target_depth:
                        should_pause = True
                        reason = "step"

            if should_pause:
                self.step_mode = None
                return self._do_pause(frame, reason)

        elif event == "call":
            if is_user_code and self.step_mode == "over":
                return self._skip_trace
            return self.trace_func

        elif event == "return":
            if self.step_mode == "out":
                depth = self._get_depth(frame)
                if depth < self.target_depth:
                    self.step_mode = None
                    return self._do_pause(frame, "step")
            return self.trace_func

        return self.trace_func

    def _skip_trace(self, frame: FrameType, event: str, arg: Any) -> Optional[callable]:
        if event == "return":
            return self.trace_func
        return self._skip_trace


class CodeBroDebuggerStopped(Exception):
    pass


debugger = CodeBroDebugger()
