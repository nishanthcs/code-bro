from __future__ import annotations

from app.tag_inference import infer_tags


def test_inference_matches_aliases_without_literal_tag_text() -> None:
    tags = infer_tags(
        "import heapq\nheapq.heappush([], 1)\n",
        [("Priority Queue", 4), ("Unrelated", 100)],
    )

    assert tags == ["Priority Queue"]


def test_inference_deduplicates_existing_tags_and_uses_usage_as_tiebreaker() -> None:
    tags = infer_tags(
        "browser = True\n",
        [("Browser", 2), ("browser", 5), ("Other", 50)],
    )

    assert tags == ["browser"]


def test_inference_does_not_treat_short_tag_substrings_as_phrase_matches() -> None:
    tags = infer_tags(
        "print('unrelated')\n",
        [("re", 100), ("Popular", 200)],
    )

    assert tags == ["Python"]


def test_inference_generates_stable_concepts_and_python_fallback() -> None:
    assert infer_tags("import asyncio\nasync def main():\n    await work()\n", []) == [
        "Async",
        "Concurrency",
    ]
    assert infer_tags("value = 1\n", []) == ["Python"]
    assert infer_tags("with open('data.txt') as handle:\n    handle.read()\n", [])[
        0
    ] == "File I/O"
    assert infer_tags("   \n", []) == []


def test_incomplete_python_uses_lexical_signals() -> None:
    tags = infer_tags("import asyncio\nasync def main(\n", [])

    assert tags[0] == "Async"
