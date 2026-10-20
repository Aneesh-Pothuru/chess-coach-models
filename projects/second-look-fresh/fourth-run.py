"""Run the fourth acquisition amendment with power and quiet receipts."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

from power import capture_power, capture_power_log, clocks, wait_power_quiet
from run import (
    LAB, LOG_ROOT as ORIGINAL_LOG_ROOT, Interrupted, exclusive_lock, interrupted,
    terminate_tree, write_final_metadata,
)


ROOT = LAB / "private/second-look-fresh/fourth-acquisition"
EXECUTION_ROOT = ROOT / "execution-root"
LOG_ROOT = ROOT / "run-log"
DRIVER = LAB / "projects/second-look-fresh/fourth-run.py"
_old_spec = importlib.util.spec_from_file_location(
    "fourth_prior_runner", DRIVER.with_name("second-run.py"))
_old = importlib.util.module_from_spec(_old_spec)
_old_spec.loader.exec_module(_old)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def write_once(path: Path, value: dict) -> None:
    with path.open("x", encoding="utf-8") as stream:
        json.dump(value, stream, indent=2, allow_nan=False)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())


def verify_quiet_freshness(receipt: dict) -> dict:
    """Use both clocks at the actual spawn boundary, after marker persistence."""
    checked = clocks()
    last = receipt["readings"][-1]
    ages = [checked["monotonicSeconds"] - last["monotonicSeconds"],
            checked["wallSeconds"] - last["wallSeconds"]]
    if not all(0 <= age <= 5 for age in ages):
        raise RuntimeError("quiet receipt became stale before replay launch; inspect the start marker")
    return checked


def ensure_no_fourth_workers() -> None:
    _old.ensure_no_second_workers()
    processes = subprocess.check_output(["/bin/ps", "-ww", "-axo", "pid=,stat=,args="], text=True)
    seen = False
    for line in processes.splitlines():
        fields = line.strip().split(None, 2)
        if len(fields) != 3 or not fields[0].isdecimal():
            raise RuntimeError("cannot validate the process inventory")
        seen = True
        if int(fields[0]) == os.getpid() or fields[1].startswith("Z"):
            continue
        arguments = fields[2]
        if (str(LAB) + "/" in arguments
                and (str(DRIVER) in arguments
                     or ("/fourth-acquisition/" in arguments
                         and any(word in arguments for word in [
                             "probe", "reference.mjs", "analyze.mjs", "stockfish", "maia",
                         ])))):
            raise RuntimeError("a fourth-acquisition worker may still be active")
    if not seen:
        raise RuntimeError("empty process inventory")


def check_local_directories() -> None:
    if Path.cwd().resolve() != LAB:
        raise RuntimeError("run this driver from its lab root")
    if ROOT.resolve() != ROOT or LOG_ROOT.resolve() != LOG_ROOT:
        raise RuntimeError("fourth-acquisition logs must remain in this clone")
    LOG_ROOT.mkdir(parents=True, exist_ok=True)
    ORIGINAL_LOG_ROOT.mkdir(parents=True, exist_ok=True)


class LoggedChildren:
    """Children own their sessions and output files; both clocks are retained."""
    def __init__(self, event_file: Path, started: float) -> None:
        self.events = event_file.open("x", encoding="utf-8")
        self.started = started
        self.active: dict[int, dict] = {}
        self.assertions: set[int] = set()
        self.completed: dict[int, dict] = {}

    def event(self, event: str, **fields) -> None:
        row = {"event": event, "at": utc_now(),
               "seconds": time.monotonic() - self.started, **fields}
        self.events.write(json.dumps(row, allow_nan=False) + "\n")
        self.events.flush()

    def assert_alive(self) -> None:
        for pid in self.assertions:
            if self.active[pid]["child"].poll() is not None:
                raise RuntimeError("a required caffeinate assertion exited")

    def assertion_evidence(self, assertions: list[subprocess.Popen]) -> list[dict]:
        return [{"pid": child.pid, "flags": ["-i", "-s"],
                 "alive": child.poll() is None, "checked": clocks()}
                for child in assertions]

    def start(self, stage: str, command: list[str], log: Path,
              *, cwd: Path = LAB, env: dict | None = None,
              before_spawn=None) -> subprocess.Popen:
        self.assert_alive()
        stream = log.open("xb")
        try:
            begin = before_spawn() if before_spawn is not None else clocks()
            child = subprocess.Popen(
                command, cwd=cwd, env=env, stdin=subprocess.DEVNULL,
                stdout=stream, stderr=subprocess.STDOUT,
                start_new_session=True, close_fds=True,
            )
        except BaseException:
            stream.close()
            raise
        self.active[child.pid] = {"child": child, "stream": stream,
                                  "stage": stage, "started": begin, "log": log.name}
        self.event("child-started", stage=stage, pid=child.pid,
                   processGroup=child.pid, log=log.name, command=command, started=begin)
        return child

    def mark_assertion(self, child: subprocess.Popen) -> None:
        # Give a failed exec an opportunity to exit before accepting the guard.
        time.sleep(.1)
        if child.poll() is not None:
            self.finish(child, monitor=False)
            raise RuntimeError("caffeinate did not remain alive")
        self.assertions.add(child.pid)
        self.event("assertion-verified", pid=child.pid, flags=["-i", "-s"])

    def finish(self, child: subprocess.Popen, *, monitor: bool = True,
               terminated: bool = False) -> dict:
        if child.pid in self.completed:
            return self.completed[child.pid]
        while child.poll() is None:
            if monitor:
                self.assert_alive()
            time.sleep(.2)
        if monitor:
            self.assert_alive()
        end = clocks()
        item = self.active.pop(child.pid)
        self.assertions.discard(child.pid)
        item["stream"].close()
        begin = item["started"]
        calendar = end["wallSeconds"] - begin["wallSeconds"]
        monotonic = end["monotonicSeconds"] - begin["monotonicSeconds"]
        result = {
            "stage": item["stage"], "pid": child.pid, "log": item["log"],
            "startedAt": begin["at"], "endedAt": end["at"],
            "startedWallSeconds": begin["wallSeconds"], "endedWallSeconds": end["wallSeconds"],
            "startedMonotonicSeconds": begin["monotonicSeconds"],
            "endedMonotonicSeconds": end["monotonicSeconds"],
            "calendarSeconds": calendar, "monotonicSeconds": monotonic,
            "calendarMinusMonotonicSeconds": calendar - monotonic,
            "exitCode": child.returncode, "terminated": terminated,
        }
        self.completed[child.pid] = result
        self.event("child-terminated" if terminated else "child-finished", **result)
        return result

    def finish_all(self, children: list[subprocess.Popen]) -> list[dict]:
        remaining = {child.pid: child for child in children}
        while remaining:
            self.assert_alive()
            for pid, child in list(remaining.items()):
                if child.poll() is not None:
                    self.finish(child)
                    del remaining[pid]
            if remaining:
                time.sleep(.2)
        return [self.completed[child.pid] for child in children]

    def stop(self, child: subprocess.Popen) -> dict:
        self.assertions.discard(child.pid)
        terminate_tree(child)
        return self.finish(child, monitor=False, terminated=True)

    def close(self) -> None:
        # Keep awake assertions alive until all work children have stopped.
        order = sorted(self.active, key=lambda pid: pid in self.assertions)
        for pid in order:
            self.stop(self.active[pid]["child"])
        self.events.close()


def run_acquisition() -> int:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    began = clocks()
    metadata_path = LOG_ROOT / f"{stamp}-run.json"
    project = LAB / "projects/second-look-fresh"
    sources = {name: hashlib.sha256((project / name).read_bytes()).hexdigest()
               for name in ["fourth-run.py", "fourth-launch.py", "power.py",
                            "quiet.py", "run.py", "second-run.py"]}
    metadata = {
        "schema": "second-look-fresh-fourth-run/1", "status": "running",
        "startedAt": began["at"], "started": began, "sourceSha256": sources,
        "command": [".venv/bin/python", "projects/second-look-fresh/fourth-run.py", "--phase2"],
    }
    write_once(metadata_path, metadata)
    children = LoggedChildren(LOG_ROOT / f"{stamp}-events.jsonl", began["monotonicSeconds"])
    previous_handlers = {sig: signal.signal(sig, interrupted)
                         for sig in (signal.SIGINT, signal.SIGTERM)}
    sequence = 0
    exit_code = 1
    environment = dict(os.environ)
    for key in ["CHESS_DIR", "CHESS_RECORDS_DIR", "CHESS_CACHE",
                *[f"{prefix}_LOOK_{field}" for prefix in ["SECOND", "FOURTH"]
                  for field in ["ORDINAL", "ATTEMPT", "QUIET_RECEIPT", "POWER_RECEIPT"]]]:
        environment.pop(key, None)

    def launch(stage: str, command: list[str], *, cwd: Path = EXECUTION_ROOT,
               env: dict | None = None, before_spawn=None) -> tuple[subprocess.Popen, Path]:
        nonlocal sequence
        sequence += 1
        log = LOG_ROOT / f"{stamp}-{sequence:03d}-{stage}.log"
        child = children.start(stage, command, log, cwd=cwd,
                               env=environment if env is None else env,
                               before_spawn=before_spawn)
        return child, log

    def assertion(stage: str) -> subprocess.Popen:
        child, _ = launch(stage, ["/usr/bin/caffeinate", "-i", "-s", "-w", str(os.getpid())],
                          cwd=LAB)
        children.mark_assertion(child)
        return child

    def helper(action: str, *arguments: str, expect_json: bool = False):
        pin = json.loads((EXECUTION_ROOT / "bridge/chess.json").read_text())
        helper_env = {**environment, "CHESS_DIR": str(EXECUTION_ROOT / ".cache/chess" / pin["commit"])}
        child, log = launch(action, ["bridge/run.sh", "projects/second-look-fresh/fourth-amendment.mjs",
                                    action, *arguments], env=helper_env)
        outcome = children.finish(child)
        if outcome["exitCode"] != 0:
            raise RuntimeError(f"acquisition helper {action} stopped; inspect its private log")
        if expect_json:
            result = json.loads(log.read_text())
            if not isinstance(result, dict):
                raise RuntimeError("acquisition helper returned no object")
            return result
        return None

    try:
        wrapper_assertion = assertion("wrapper-awake")
        child, _ = launch("fourth-runtime",
                          ["node", "projects/second-look-fresh/fourth-runtime.mjs", "prepare"], cwd=LAB)
        if children.finish(child)["exitCode"] != 0:
            raise RuntimeError("frozen fourth execution preparation failed")
        helper("prepare")
        attempts, quiet, power = [ROOT / name for name in ["driver-attempts", "quiet", "power"]]
        for path in [attempts, quiet, power]:
            if path.resolve() != path:
                raise RuntimeError("driver receipt directories must not be redirected")
            path.mkdir(parents=True, exist_ok=True)
        while True:
            result = helper("next", expect_json=True)
            if set(result) != {"next"}:
                raise RuntimeError("next helper returned unexpected fields")
            item = result["next"]
            if item is None:
                break
            if (not isinstance(item, dict) or set(item) != {"ordinal", "attempt"}
                    or type(item["ordinal"]) is not int or not 1 <= item["ordinal"] <= 60
                    or type(item["attempt"]) is not int or item["attempt"] not in {1, 2}):
                raise RuntimeError("next helper returned an invalid prescribed attempt")
            ordinal, attempt = item["ordinal"], item["attempt"]
            label = f"game-{ordinal:02d}-attempt-{attempt}"
            marker = attempts / f"{label}-started.json"
            quiet_receipt_path = quiet / f"{label}-receipt.json"
            power_receipt_path = power / f"{label}-receipt.json"
            power_log_path = power / f"{label}-powerlog.json"
            finished_path = attempts / f"{label}-finished.json"
            if any(path.exists() for path in [marker, quiet_receipt_path, power_receipt_path,
                                               power_log_path, finished_path]):
                raise RuntimeError("attempt evidence already exists; inspect before resuming")
            replay_assertion = assertion(f"{label}-awake")
            children.event("quiet-started", ordinal=ordinal, attempt=attempt)
            receipts = wait_power_quiet(quiet / f"{label}-samples.jsonl",
                                        power / f"{label}-samples.jsonl", children.assert_alive)
            quiet_receipt, power_receipt = receipts["quiet"], receipts["power"]
            write_once(quiet_receipt_path, quiet_receipt)
            write_once(power_receipt_path, power_receipt)
            children.event("quiet-passed", ordinal=ordinal, attempt=attempt,
                           quietReceiptSha256=quiet_receipt["receiptSha256"],
                           powerReceiptSha256=power_receipt["receiptSha256"],
                           quietSeconds=quiet_receipt["quietSeconds"])
            start_record = {
                "schema": "second-look-fresh-fourth-replay-start/1",
                "ordinal": ordinal, "attempt": attempt, "startedAt": utc_now(),
                "quietReceiptSha256": quiet_receipt["receiptSha256"],
                "powerReceiptSha256": power_receipt["receiptSha256"],
                "runMetadata": metadata_path.name,
                "wrapperAwakePid": wrapper_assertion.pid, "replayAwakePid": replay_assertion.pid,
                "assertionsBeforeLaunch": children.assertion_evidence(
                    [wrapper_assertion, replay_assertion]),
            }
            children.assert_alive()
            if not 0 <= time.monotonic() - quiet_receipt["readings"][-1]["monotonicSeconds"] <= 5:
                raise RuntimeError("quiet receipt became stale before replay launch")
            write_once(marker, start_record)
            probe_env = {
                **environment,
                "CHESS_DIR": str(EXECUTION_ROOT / ".cache/chess/candidates/second-look-fresh"),
                "FOURTH_LOOK_ORDINAL": str(ordinal), "FOURTH_LOOK_ATTEMPT": str(attempt),
                "FOURTH_LOOK_QUIET_RECEIPT": str(quiet_receipt_path),
                "FOURTH_LOOK_POWER_RECEIPT": str(power_receipt_path),
            }
            child, _ = launch(label, [
                "nice", "-n", "10", "bridge/run.sh",
                "projects/second-look-fresh/fourth-probe.mjs",
                "--all", "--phase2", "--variant", "candidate", "--profile", "routine",
            ], env=probe_env, before_spawn=lambda: verify_quiet_freshness(quiet_receipt))
            interruption = None
            try:
                outcome = children.finish(child)
            except BaseException as error:
                interruption = error
                outcome = children.stop(child)
            end_assertions = children.assertion_evidence([wrapper_assertion, replay_assertion])
            # Persist clocks and the power log before classification, including
            # a nonzero probe exit. An interrupted attempt is never retried here.
            try:
                power_log = capture_power_log(outcome["startedAt"], outcome["endedAt"],
                                              children.assert_alive if interruption is None else lambda: None)
                write_once(power_log_path, power_log)
                power_log_error = None
            except BaseException as error:
                power_log = None
                power_log_error = type(error).__name__
                if interruption is None:
                    interruption = error
            completed = {
                **start_record, "schema": "second-look-fresh-fourth-replay-finish/1",
                "finishedAt": utc_now(), "probeExitCode": outcome["exitCode"], "process": outcome,
                "assertionsAfterReplay": end_assertions,
                "powerLogReceipt": str(power_log_path.relative_to(LAB)) if power_log else None,
                "powerLogReceiptSha256": power_log["receiptSha256"] if power_log else None,
                "powerLogCaptureError": power_log_error,
            }
            write_once(finished_path, completed)
            if power_log is not None and (power_log["error"] is not None or power_log["exitCode"] != 0):
                interruption = interruption or RuntimeError("replay power-log capture failed")
            children.stop(replay_assertion)
            if interruption is not None:
                raise interruption
            classified = helper("classify", "--ordinal", str(ordinal), "--attempt", str(attempt),
                                expect_json=True)
            if classified.get("outcome") not in {"accepted", "infrastructure-failure"}:
                raise RuntimeError("classifier returned an unexpected outcome")
            children.event("replay-classified", ordinal=ordinal, attempt=attempt,
                           probeExitCode=outcome["exitCode"], outcome=classified["outcome"])
        helper("check-complete")
        # References also run under the wrapper's system and idle assertions.
        while True:
            children.assert_alive()
            reference_power = capture_power()
            with (power / "reference-power.jsonl").open("a", encoding="utf-8") as stream:
                stream.write(json.dumps(reference_power, allow_nan=False) + "\n")
                stream.flush()
            if reference_power["ready"]:
                break
            time.sleep(5)
        references = [
            launch(f"reference-{shard}", ["nice", "-n", "10", "bridge/run.sh",
                   "projects/second-look-fresh/reference.mjs", "--phase2", "--shard", f"{shard}/2"])[0]
            for shard in [0, 1]
        ]
        if any(outcome["exitCode"] != 0 for outcome in children.finish_all(references)):
            raise RuntimeError("a registered reference shard failed; analysis did not start")
        helper("check-complete")
        child, _ = launch("analysis", ["nice", "-n", "10", "bridge/run.sh",
                                     "projects/second-look-fresh/analyze.mjs", "--phase2"])
        exit_code = children.finish(child)["exitCode"]
    except Interrupted as error:
        exit_code = 128 + error.signum
        children.event("wrapper-interrupted", signal=error.signum)
    except Exception as error:
        children.event("wrapper-stopped", errorType=type(error).__name__, reason=str(error))
        print(f"Fourth acquisition stopped: {error}", flush=True)
    finally:
        for sig in previous_handlers:
            signal.signal(sig, signal.SIG_IGN)
        try:
            children.close()
        finally:
            end = clocks()
            metadata.update(status="finished", endedAt=end["at"], ended=end,
                            seconds=end["monotonicSeconds"] - began["monotonicSeconds"],
                            calendarSeconds=end["wallSeconds"] - began["wallSeconds"],
                            calendarMinusMonotonicSeconds=(
                                end["wallSeconds"] - began["wallSeconds"]
                                - end["monotonicSeconds"] + began["monotonicSeconds"]),
                            exitCode=exit_code)
            write_final_metadata(metadata_path, metadata)
            for sig, handler in previous_handlers.items():
                signal.signal(sig, handler)
    return exit_code


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--phase2", action="store_true", required=True)
    parser.parse_args()
    try:
        check_local_directories()
        with exclusive_lock(ORIGINAL_LOG_ROOT / ".run.lock"):
            with exclusive_lock(LOG_ROOT / ".run.lock"):
                ensure_no_fourth_workers()
                return run_acquisition()
    except RuntimeError as error:
        parser.error(str(error))


if __name__ == "__main__":
    sys.exit(main())
