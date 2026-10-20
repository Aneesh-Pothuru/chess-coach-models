"""Read detached-run status and checkpoint counts without reading verdicts."""
from datetime import datetime
import json
import re
from pathlib import Path
from run import recorded_wrapper_active

LAB = Path(__file__).resolve().parents[2]
ROOT = LAB / "private/second-look-fresh"
LOG = ROOT / "run-log"
PROFILES = ["phone", "desktop", "routine"]


def json_if_ready(path: Path):
    try:
        text = path.read_text()
    except FileNotFoundError:
        return None
    if not text.strip():
        return None
    try:
        row = json.loads(text)
    except json.JSONDecodeError:
        # Initial metadata can be observed between create and close. A full
        # object with invalid JSON is an error, not a startup state.
        if not text.rstrip().endswith("}"):
            return None
        raise ValueError("Malformed complete metadata JSON") from None
    if not isinstance(row, dict):
        raise ValueError("Metadata JSON is not an object")
    return row


def output_lines(path: Path) -> list[str]:
    try:
        lines = path.read_text().splitlines(keepends=True)
    except FileNotFoundError:
        return []
    result = []
    for index, text in enumerate(lines):
        try:
            row = json.loads(text)
        except json.JSONDecodeError:
            if index == len(lines) - 1 and not text.endswith(("\n", "\r")):
                break
            raise ValueError(f"Malformed complete output envelope at line {index + 1}") from None
        if not isinstance(row, dict) or not isinstance(row.get("line"), str):
            raise ValueError(f"Invalid output envelope at line {index + 1}")
        result.append(row["line"])
    return result


def status_report(log_root: Path = LOG, project_root: Path = ROOT,
                  wrapper_active=recorded_wrapper_active) -> dict:
    counts = {arm: {kind: {profile: len(list((project_root / arm / kind / profile).glob("*.json")))
                          for profile in PROFILES}
                    for kind in ["evidence", "timed"]}
              for arm in ["baseline", "candidate"]}
    launches = sorted(log_root.glob("*-launcher.json"))
    launch = json_if_ready(launches[-1]) if launches else None
    if launch is None:
        return {"pid": None, "active": False, "status": "starting" if launches else "not-launched",
                "exitCode": None, "summary": "Detached launch metadata is not available yet.",
                "checkpoints": counts, "runMetadata": None, "log": None}
    active = wrapper_active(launch)
    runs = sorted(log_root.glob("*-run.json"))
    meta_path = runs[-1] if runs else None
    meta = json_if_ready(meta_path) if meta_path else None
    current = (meta is not None and datetime.fromisoformat(meta["startedAt"])
               >= datetime.fromisoformat(launch["startedAt"]))
    status = meta.get("status") if current else "not-started"
    summary = "Detached wrapper is starting."
    arm = "baseline"
    if current:
        output = meta_path.with_name(meta_path.name.replace("-run.json", "-output.jsonl"))
        for line in output_lines(output):
            begin = re.match(r"\[(phone|desktop|routine)\].*/(baseline|candidate)/evidence/", line)
            if begin:
                profile, arm = begin.groups()
                summary = f"{arm} {profile} build: {counts[arm]['evidence'][profile]}/60 saved."
            progress = re.match(r"\[(phone|desktop|routine)\].* done .*?(\d+) failed", line)
            if progress:
                profile, failed = progress.groups()
                summary = f"{arm} {profile} build: {counts[arm]['evidence'][profile]}/60 saved; {failed} failed this invocation."
            timed = re.match(r"\[(baseline|candidate)/(phone|desktop|routine)\] case", line)
            if timed:
                a, p = timed.groups()
                summary = f"{a} {p} observed replay: {counts[a]['timed'][p]}/60 saved."
            try:
                row = json.loads(line)
            except (ValueError, TypeError):
                continue
            if not isinstance(row, dict):
                continue
            if row.get("variant") in counts and row.get("profile") in PROFILES and "completed" in row:
                a, p = row["variant"], row["profile"]
                summary = f"{a} {p} observed replay: {counts[a]['timed'][p]}/60 saved."
            if "finishedGameOrdinal" in row:
                summary = "Reference searches are progressing."
            if "disposition" in row:
                summary = "Analysis finished; results are ready to inspect."
    if status == "finished":
        summary = f"Phase-two script finished with exit code {meta['exitCode']}."
    elif not active:
        summary = "The detached wrapper is absent without a completed run record; inspect before resuming."
    return {"pid": launch["pid"], "active": active, "status": status,
            "exitCode": meta.get("exitCode") if current else None,
            "summary": summary, "checkpoints": counts,
            "runMetadata": meta_path.name if meta_path else None, "log": launch["log"]}


if __name__ == "__main__":
    print(json.dumps(status_report()))
