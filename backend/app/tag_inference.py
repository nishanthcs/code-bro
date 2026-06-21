from __future__ import annotations

import ast
import io
import re
import tokenize
import unicodedata
from dataclasses import dataclass, field


# Existing tags must have a concrete source or semantic match. Usage count is
# intentionally excluded from the score and is used only as a tie-breaker.
MIN_EXISTING_TAG_SCORE = 0.8

ALIAS_CATALOG: dict[str, tuple[str, ...]] = {
    "aiohttp": ("HTTP", "Async"),
    "argparse": ("CLI",),
    "asyncio": ("Async", "Concurrency"),
    "click": ("CLI",),
    "collections.deque": ("Deque", "Data Structures"),
    "csv": ("CSV",),
    "dataclasses": ("Data Classes",),
    "datetime": ("Date/Time",),
    "django": ("Django", "Web"),
    "fastapi": ("FastAPI", "Web"),
    "flask": ("Flask", "Web"),
    "heapq": ("Heap", "Priority Queue", "Data Structures"),
    "json": ("JSON",),
    "matplotlib": ("Plotting",),
    "numpy": ("NumPy",),
    "pandas": ("Pandas",),
    "pathlib": ("File I/O",),
    "pytest": ("Testing",),
    "re": ("Regex",),
    "requests": ("HTTP",),
    "seaborn": ("Plotting",),
    "sqlite3": ("Database", "SQL"),
    "sqlalchemy": ("Database", "SQL"),
    "threading": ("Threading", "Concurrency"),
    "typer": ("CLI",),
    "unittest": ("Testing",),
    "urllib": ("HTTP",),
}

LEXICAL_CONCEPTS: dict[str, tuple[str, ...]] = {
    "Async": ("async", "await", "asyncio"),
    "CLI": ("cli", "command line", "argparse"),
    "Database": ("database", "sqlite", "sql query"),
    "Dynamic Programming": ("dynamic programming", "memoization", "tabulation"),
    "File I/O": ("file io", "read file", "write file"),
    "Graph": ("graph", "vertex", "edge", "bfs", "dfs", "dijkstra"),
    "HTTP": ("http", "api request", "endpoint"),
    "JSON": ("json",),
    "Recursion": ("recursion", "recursive", "base case"),
    "Regex": ("regex", "regular expression"),
    "Searching": ("binary search", "linear search"),
    "Sorting": ("sorting", "merge sort", "quick sort"),
    "Testing": ("pytest", "unit test", "test case"),
    "Tree": ("binary tree", "tree traversal", "bst"),
}


def _normalized(value: str) -> str:
    return unicodedata.normalize("NFKC", value).casefold()


def _dotted_name(node: ast.AST) -> str | None:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        parent = _dotted_name(node.value)
        return f"{parent}.{node.attr}" if parent else node.attr
    return None


@dataclass
class CodeSignals:
    imports: set[str] = field(default_factory=set)
    identifiers: set[str] = field(default_factory=set)
    calls: set[str] = field(default_factory=set)
    attributes: set[str] = field(default_factory=set)
    comments: list[str] = field(default_factory=list)
    docstrings: list[str] = field(default_factory=list)
    has_async: bool = False
    has_comprehension: bool = False
    has_context_manager: bool = False
    has_dataclass: bool = False
    has_exception_handling: bool = False
    has_generator: bool = False
    has_recursion: bool = False
    has_type_annotations: bool = False

    def searchable_tokens(self) -> set[str]:
        values = self.imports | self.identifiers | self.calls | self.attributes
        tokens: set[str] = set()
        for value in values:
            tokens.update(re.findall(r"[a-z0-9]+", _normalized(value)))
        return tokens


def _extract_ast_signals(tree: ast.AST, signals: CodeSignals) -> None:
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                signals.imports.add(alias.name)
                signals.identifiers.add(alias.name.split(".", 1)[0])
                if alias.asname:
                    signals.identifiers.add(alias.asname)
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                signals.imports.add(node.module)
            for alias in node.names:
                signals.identifiers.add(alias.name)
                if node.module:
                    signals.imports.add(f"{node.module}.{alias.name}")
                if alias.asname:
                    signals.identifiers.add(alias.asname)
        elif isinstance(node, ast.Name):
            signals.identifiers.add(node.id)
        elif isinstance(node, ast.Attribute):
            dotted = _dotted_name(node)
            if dotted:
                signals.attributes.add(dotted)
            signals.identifiers.add(node.attr)
        elif isinstance(node, ast.Call):
            called = _dotted_name(node.func)
            if called:
                signals.calls.add(called)
        elif isinstance(
            node,
            (ast.AsyncFunctionDef, ast.AsyncFor, ast.AsyncWith, ast.Await),
        ):
            signals.has_async = True
            if isinstance(node, ast.AsyncWith):
                signals.has_context_manager = True
            if isinstance(node, ast.AsyncFunctionDef) and node.returns is not None:
                signals.has_type_annotations = True
        elif isinstance(node, (ast.ListComp, ast.SetComp, ast.DictComp)):
            signals.has_comprehension = True
        elif isinstance(node, (ast.GeneratorExp, ast.Yield, ast.YieldFrom)):
            signals.has_generator = True
        elif isinstance(node, (ast.With, ast.AsyncWith)):
            signals.has_context_manager = True
        elif isinstance(node, (ast.Try, ast.TryStar)):
            signals.has_exception_handling = True
        elif isinstance(node, (ast.AnnAssign, ast.arg)) and getattr(
            node, "annotation", None
        ) is not None:
            signals.has_type_annotations = True
        elif isinstance(node, ast.ClassDef):
            for decorator in node.decorator_list:
                if (_dotted_name(decorator) or "").split(".")[-1] == "dataclass":
                    signals.has_dataclass = True
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if node.returns is not None:
                signals.has_type_annotations = True

    for node in ast.walk(tree):
        if isinstance(
            node,
            (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef),
        ):
            docstring = ast.get_docstring(node, clean=False)
            if docstring:
                signals.docstrings.append(_normalized(docstring))
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for child in ast.walk(node):
                if (
                    isinstance(child, ast.Call)
                    and _dotted_name(child.func) == node.name
                ):
                    signals.has_recursion = True
                    break


def _extract_token_signals(source: str, signals: CodeSignals) -> None:
    try:
        tokens = tokenize.generate_tokens(io.StringIO(source).readline)
        for token in tokens:
            if token.type == tokenize.NAME:
                signals.identifiers.add(token.string)
                if token.string in {"async", "await"}:
                    signals.has_async = True
            elif token.type == tokenize.COMMENT:
                signals.comments.append(_normalized(token.string.lstrip("#")))
    except (IndentationError, SyntaxError, tokenize.TokenError):
        # Tokenization yields useful identifiers before many incomplete-draft
        # errors, so retain what was collected.
        pass


def extract_signals(source: str) -> CodeSignals:
    signals = CodeSignals()
    try:
        _extract_ast_signals(ast.parse(source), signals)
    except SyntaxError:
        pass
    _extract_token_signals(source, signals)
    return signals


def _matches_alias(signal: str, alias: str) -> bool:
    normalized_signal = _normalized(signal)
    normalized_alias = _normalized(alias)
    return (
        normalized_signal == normalized_alias
        or normalized_signal.startswith(f"{normalized_alias}.")
        or normalized_signal.split(".", 1)[0] == normalized_alias
    )


def _score_concepts(signals: CodeSignals) -> dict[str, float]:
    scores: dict[str, float] = {}

    def add(label: str, score: float) -> None:
        scores[label] = scores.get(label, 0.0) + score

    for alias, labels in ALIAS_CATALOG.items():
        if any(_matches_alias(value, alias) for value in signals.imports):
            for label in labels:
                add(label, 3.0)
        elif any(
            _matches_alias(value, alias)
            for value in signals.calls | signals.attributes | signals.identifiers
        ):
            for label in labels:
                add(label, 1.4)

    if signals.has_async:
        add("Async", 3.0)
    if signals.has_recursion:
        add("Recursion", 3.0)
    if signals.has_dataclass:
        add("Data Classes", 2.5)
    if signals.has_exception_handling:
        add("Error Handling", 1.2)
    if signals.has_context_manager:
        add("Context Managers", 1.2)
    if signals.has_type_annotations:
        add("Type Hints", 1.0)
    if signals.has_comprehension or signals.has_generator:
        add("Comprehensions", 1.0)

    identifiers = {_normalized(value) for value in signals.identifiers}
    identifier_groups = {
        "Data Structures": {
            "deque",
            "heap",
            "heapq",
            "queue",
            "stack",
            "set",
            "map",
        },
        "Dynamic Programming": {"memo", "memoization", "dp", "tabulation"},
        "File I/O": {"open", "read", "write", "read_text", "write_text"},
        "Graph": {"graph", "vertex", "edge", "bfs", "dfs", "dijkstra"},
        "Searching": {"search", "binary_search", "bfs", "dfs"},
        "Sorting": {"sort", "sorted", "merge_sort", "quick_sort", "heapsort"},
        "Tree": {"tree", "root", "leaf", "bst", "traversal"},
    }
    for label, names in identifier_groups.items():
        if identifiers & names:
            add(label, 2.0)

    for text, weight in (
        *((text, 0.65) for text in signals.comments),
        *((text, 0.35) for text in signals.docstrings),
    ):
        for label, phrases in LEXICAL_CONCEPTS.items():
            if any(phrase in text for phrase in phrases):
                add(label, weight)

    return scores


def _existing_tag_score(
    tag_display: str,
    signals: CodeSignals,
    source_normalized: str,
    concepts: dict[str, float],
) -> float:
    normalized_tag = _normalized(tag_display)
    score = 0.0

    if normalized_tag and re.search(
        rf"(?<!\w){re.escape(normalized_tag)}(?!\w)",
        source_normalized,
    ):
        score += 1.5

    normalized_concepts = {
        _normalized(label): concept_score for label, concept_score in concepts.items()
    }
    score += normalized_concepts.get(normalized_tag, 0.0)

    tag_tokens = set(re.findall(r"[a-z0-9]+", normalized_tag))
    score += 0.9 * len(tag_tokens & signals.searchable_tokens())

    return score


def infer_tags(
    source: str,
    existing_tags: list[tuple[str, int]],
    max_results: int = 2,
) -> list[str]:
    if max_results <= 0 or not source.strip():
        return []

    signals = extract_signals(source)
    concepts = _score_concepts(signals)
    source_normalized = _normalized(source)

    candidates: dict[str, tuple[str, int]] = {}
    for display, usage_count in existing_tags:
        normalized_display = _normalized(display.strip())
        if not normalized_display:
            continue
        current = candidates.get(normalized_display)
        if current is None or usage_count > current[1] or (
            usage_count == current[1]
            and (display.casefold(), display) < (current[0].casefold(), current[0])
        ):
            candidates[normalized_display] = (display.strip(), usage_count)

    ranked_existing: list[tuple[float, int, str, str]] = []
    for normalized_display, (display, usage_count) in candidates.items():
        score = _existing_tag_score(
            display,
            signals,
            source_normalized,
            concepts,
        )
        if score >= MIN_EXISTING_TAG_SCORE:
            ranked_existing.append(
                (score, usage_count, normalized_display, display)
            )
    ranked_existing.sort(
        key=lambda item: (-item[0], -item[1], item[2], item[3])
    )
    if ranked_existing:
        return [item[3] for item in ranked_existing[:max_results]]

    ranked_concepts = sorted(
        concepts.items(),
        key=lambda item: (-item[1], _normalized(item[0]), item[0]),
    )
    generated: list[str] = []
    seen: set[str] = set()
    for label, _score in ranked_concepts:
        key = _normalized(label)
        if key in seen:
            continue
        seen.add(key)
        generated.append(label)
        if len(generated) >= max_results:
            break
    return generated or ["Python"]
