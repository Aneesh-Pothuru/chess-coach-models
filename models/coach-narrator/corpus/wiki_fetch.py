"""Pages of a Wikimedia wiki as their wikitext, for the narrator's corpora: Wikibooks' chess opening theory
and Wikipedia's chess articles (text under CC BY-SA 4.0; each page's revision is kept for attribution).

usage: python wiki_fetch.py --site en.wikibooks.org --prefix "Chess Opening Theory/" --out FILE.jsonl
       python wiki_fetch.py --site en.wikipedia.org --category "Chess tactics" --depth 2 --out FILE.jsonl

Writes a JSON line a page: the site, title, page id, revision id and time, the page's categories and its
wikitext. A run that stops keeps what it wrote, and the next run with the same ``--out`` fetches only the
pages it does not have. Requests go one at a time with a pause between them, as the API's etiquette asks.
"""

from __future__ import annotations

import argparse
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

AGENT = "chess-coach-models-corpus/0.1 (research script; one request at a time)"
PAUSE = 1.5
BATCH = 50


def call(site: str, params: dict) -> dict:
    """One API query, sent as a POST so that fifty long page titles fit."""
    query = {"format": "json", "formatversion": "2", "maxlag": "5", **params}
    body = urllib.parse.urlencode(query).encode("utf-8")
    problem = ""
    for attempt in range(6):
        try:
            request = urllib.request.Request(f"https://{site}/w/api.php", data=body, headers={"User-Agent": AGENT})
            with urllib.request.urlopen(request, timeout=60) as response:
                data = json.loads(response.read().decode("utf-8"))
            if data.get("error", {}).get("code") == "maxlag":
                time.sleep(5 * (attempt + 1))
                continue
            time.sleep(PAUSE)
            return data
        except (OSError, json.JSONDecodeError) as error:
            problem = str(error)
            wait = 5 * (attempt + 1)
            if getattr(error, "code", None) == 429:
                retry = getattr(error, "headers", {}).get("Retry-After", "") if getattr(error, "headers", None) else ""
                wait = max(60 * (attempt + 1), int(retry) if retry.isdigit() else 0)
            time.sleep(wait)
    raise OSError(f"{site} did not answer a {params.get('list') or params.get('prop')} query: {problem}")


def prefix_titles(site: str, prefix: str) -> list[str]:
    titles: list[str] = []
    cont: dict = {}
    while True:
        data = call(site, {"action": "query", "list": "allpages", "apprefix": prefix, "apnamespace": 0,
                           "aplimit": "max", **cont})
        titles += [page["title"] for page in data["query"]["allpages"]]
        if "continue" not in data:
            return titles
        cont = data["continue"]


def category_titles(site: str, category: str, depth: int) -> list[str]:
    """Articles in a category and in its subcategories down to ``depth``, each once."""
    seen_categories: set[str] = set()
    titles: dict[str, None] = {}
    frontier = [category if category.startswith("Category:") else f"Category:{category}"]
    for level in range(depth + 1):
        next_frontier = []
        for name in frontier:
            if name in seen_categories:
                continue
            seen_categories.add(name)
            cont: dict = {}
            while True:
                data = call(site, {"action": "query", "list": "categorymembers", "cmtitle": name,
                                   "cmtype": "page|subcat", "cmlimit": "max", **cont})
                for member in data["query"]["categorymembers"]:
                    if member["ns"] == 0:
                        titles.setdefault(member["title"], None)
                    elif member["ns"] == 14 and level < depth:
                        next_frontier.append(member["title"])
                if "continue" not in data:
                    break
                cont = data["continue"]
        frontier = next_frontier
    return list(titles)


def fetch(site: str, titles: list[str], out: Path) -> int:
    have = set()
    if out.exists():
        with out.open(encoding="utf-8") as handle:
            have = {json.loads(line)["title"] for line in handle if line.strip()}
    todo = [title for title in titles if title not in have]
    written = 0
    with out.open("a", encoding="utf-8") as handle:
        for start in range(0, len(todo), BATCH):
            batch = todo[start:start + BATCH]
            data = call(site, {"action": "query", "prop": "revisions|categories", "rvprop": "content|ids|timestamp",
                               "rvslots": "main", "cllimit": "max", "clshow": "!hidden", "redirects": "1",
                               "titles": "|".join(batch)})
            for page in data["query"].get("pages", []):
                if page.get("missing") or "revisions" not in page:
                    continue
                revision = page["revisions"][0]
                record = {
                    "site": site,
                    "title": page["title"],
                    "pageid": page["pageid"],
                    "revid": revision["revid"],
                    "timestamp": revision["timestamp"],
                    "categories": [entry["title"].removeprefix("Category:") for entry in page.get("categories", [])],
                    "content": revision["slots"]["main"]["content"],
                }
                if record["title"] in have:
                    continue
                have.add(record["title"])
                handle.write(json.dumps(record, ensure_ascii=False) + "\n")
                written += 1
            print(f"{min(start + BATCH, len(todo)):,}/{len(todo):,} pages asked, {written:,} written", flush=True)
    return written


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--site", required=True)
    parser.add_argument("--prefix")
    parser.add_argument("--category", action="append", default=[])
    parser.add_argument("--depth", type=int, default=1)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    titles: list[str] = []
    if args.prefix:
        titles += prefix_titles(args.site, args.prefix)
    for category in args.category:
        titles += category_titles(args.site, category, args.depth)
    titles = list(dict.fromkeys(titles))
    print(f"{len(titles):,} titles", flush=True)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    fetch(args.site, titles, out)


if __name__ == "__main__":
    main()
