"""Shared config and helpers for the PolSett LLM survey pipeline."""

import json
import os
import re
import sys
from pathlib import Path

import anthropic

ROOT = Path(__file__).resolve().parent.parent  # polsett-llm/
INSTRUMENT = ROOT / "instrument"
ESID = ROOT / "esid"
OUTPUT = ROOT / "output"

DEFAULT_MODEL = "claude-opus-4-8"
DEFAULT_CODERS = 3
DEFAULT_END_YEAR = 2026

# Period types that receive the Phase 2 survey (codebook 2.1.2.2): settled,
# challenged, transitional. Unsettled and semi-settled periods are not coded.
CODEABLE_TYPE_RE = re.compile(r"settled|challenged|transitional|tbd", re.I)
NON_CODEABLE_RE = re.compile(r"semi.?settled|unsettled", re.I)


def is_codeable_type(t: str) -> bool:
    if not t:
        return False
    if NON_CODEABLE_RE.search(t):
        return False
    return bool(CODEABLE_TYPE_RE.search(t))


def get_client() -> anthropic.AsyncAnthropic:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        env_file = ROOT / ".env"
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                if line.startswith("ANTHROPIC_API_KEY="):
                    os.environ["ANTHROPIC_API_KEY"] = (
                        line.split("=", 1)[1].strip().strip('"'))
    if not os.environ.get("ANTHROPIC_API_KEY"):
        sys.exit("ANTHROPIC_API_KEY is not set. Export it or put "
                 "ANTHROPIC_API_KEY=sk-ant-... in polsett-llm/.env")
    return anthropic.AsyncAnthropic(timeout=900.0, max_retries=4)


def read_json(path: Path):
    with open(path) as f:
        return json.load(f)


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w") as f:
        json.dump(obj, f, indent=1, ensure_ascii=False)
    tmp.replace(path)


def country_registry() -> dict:
    """ESID country name -> iso3."""
    return read_json(ESID / "countries.json")


def resolve_country(name: str, iso3: str | None = None):
    """Returns (canonical_name, iso3, in_esid)."""
    reg = country_registry()
    for cname, ciso in reg.items():
        if cname.lower() == name.lower():
            return cname, ciso, True
    if iso3:
        return name, iso3.upper(), False
    sys.exit(
        f"'{name}' is not in the ESID dataset; pass --iso3 for new countries "
        f"(known: {', '.join(sorted(reg))})"
    )


def out_dir(iso3: str) -> Path:
    d = OUTPUT / iso3
    d.mkdir(parents=True, exist_ok=True)
    return d


def extract_fenced_json(text: str):
    """Parse the last ```json ...``` block (or bare JSON) from model text."""
    fences = re.findall(r"```(?:json)?\s*(.*?)```", text, re.S)
    candidates = fences[::-1] + [text]
    for c in candidates:
        c = c.strip()
        start = min([i for i in (c.find("{"), c.find("[")) if i >= 0], default=-1)
        if start < 0:
            continue
        try:
            return json.loads(c[start:])
        except json.JSONDecodeError:
            continue
    raise ValueError("no parseable JSON found in model output")


RESEARCH_TOOLS = [
    {"type": "web_search_20260209", "name": "web_search", "max_uses": 8},
    {"type": "web_fetch_20260209", "name": "web_fetch", "max_uses": 5},
]


async def research_call(client, model, system, user_prompt, max_tokens=8000,
                        max_search_uses=8, max_continuations=6):
    """Run one research turn with server-side web tools, handling pause_turn.

    Returns (final_text, messages, sources) where sources is the list of URLs
    that appeared in web search/fetch result blocks.
    """
    tools = [
        {"type": "web_search_20260209", "name": "web_search",
         "max_uses": max_search_uses},
        {"type": "web_fetch_20260209", "name": "web_fetch", "max_uses": 5},
    ]
    messages = [{"role": "user", "content": user_prompt}]
    sources = []
    for _ in range(max_continuations):
        resp = await client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=[{"type": "text", "text": system,
                     "cache_control": {"type": "ephemeral"}}],
            tools=tools,
            messages=messages,
        )
        for block in resp.content:
            if block.type == "web_search_tool_result":
                content = block.content
                if isinstance(content, list):
                    for r in content:
                        url = getattr(r, "url", None)
                        if url:
                            sources.append(url)
            elif block.type == "web_fetch_tool_result":
                url = getattr(getattr(block, "content", None), "url", None)
                if url:
                    sources.append(url)
        messages.append({"role": "assistant", "content": resp.content})
        if resp.stop_reason != "pause_turn":
            break
    text = "".join(b.text for b in resp.content if b.type == "text")
    return text, messages, sorted(set(sources))
