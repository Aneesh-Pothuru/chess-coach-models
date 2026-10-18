"""Operational controls tested without streams, engines or real games."""
import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import run_phase2 as runner


class RunnerTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='rules-runner-', dir='/tmp')
        self.directory = Path(self.temp.name)
        (self.directory / 'logs').mkdir()
        self.patch = patch.object(runner, 'DIRECTORY', self.directory)
        self.patch.start()
        runner.STOP.clear()
        runner.CHILDREN.clear()
        runner.SIGNAL_RECEIVED = False

    def tearDown(self):
        runner.STOP.clear()
        runner.CHILDREN.clear()
        runner.SIGNAL_RECEIVED = False
        self.patch.stop()
        self.temp.cleanup()

    def test_detached_driver_owns_file_output(self):
        captured = {}
        class Process:
            pid = 12345
            def poll(self):
                return None
        def launch(command, **kwargs):
            captured.update(command=command, **kwargs)
            kwargs['stdout'].write(b'driver log\n')
            runner.atomic_json(self.directory / 'driver.json', {'pid': Process.pid, 'status': 'running'})
            return Process()
        with patch.object(runner.subprocess, 'Popen', side_effect=launch), \
                patch.object(runner, 'LAB', self.directory), contextlib.redirect_stdout(io.StringIO()):
            runner.launch_detached()
        self.assertTrue(captured['start_new_session'])
        self.assertTrue(captured['close_fds'])
        self.assertEqual(captured['stdin'], runner.subprocess.DEVNULL)
        self.assertEqual(captured['stderr'], runner.subprocess.STDOUT)
        self.assertNotIn('--detach', captured['command'])
        self.assertEqual(next((self.directory / 'logs').glob('driver-*.log')).read_text(), 'driver log\n')

    def test_failure_is_logged_and_not_silently_restarted(self):
        class Process:
            pid = 12345
            def wait(self, **_kwargs):
                return 9
        with patch.object(runner, 'verify_manifest'), patch.object(runner, 'complete', return_value=False), \
                patch.object(runner.subprocess, 'Popen', return_value=Process()) as launch, \
                patch.object(runner, 'stop_group') as stop_group, \
                contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises(RuntimeError):
                runner.run_stage('positions', '2026-07')
        events = [json.loads(line) for line in (self.directory / 'stage-events.jsonl').read_text().splitlines()]
        self.assertEqual([event['event'] for event in events], ['started', 'stopped'])
        self.assertEqual(events[-1]['exitCode'], 9)
        self.assertEqual(events[-1]['stopReason'], 'stage-failure')
        self.assertGreaterEqual(events[-1]['seconds'], 0)
        self.assertEqual(launch.call_count, 1)
        stop_group.assert_called_once_with(Process.pid)
        command = launch.call_args.args[0]
        self.assertEqual(command[:3], ['nice', '-n', '10'])
        self.assertEqual(command[-2:], ['--pool', '2'])
        self.assertTrue(launch.call_args.kwargs['start_new_session'])
        self.assertFalse(runner.CHILDREN)

    def test_stop_cleans_group_while_leader_is_still_running(self):
        class Process:
            pid = 12345
            calls = 0
            def wait(self, **_kwargs):
                self.calls += 1
                if self.calls == 1:
                    runner.STOP.set()
                    runner.SIGNAL_RECEIVED = True
                    raise runner.subprocess.TimeoutExpired('synthetic', 0.5)
                return -15
        with patch.object(runner, 'verify_manifest'), patch.object(runner, 'complete', return_value=False), \
                patch.object(runner.subprocess, 'Popen', return_value=Process()), \
                patch.object(runner, 'stop_group') as stop_group, contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises(InterruptedError):
                runner.run_stage('positions', '2026-07')
        self.assertGreaterEqual(stop_group.call_count, 1)
        self.assertEqual(stop_group.call_args.args, (Process.pid,))
        events = [json.loads(line) for line in (self.directory / 'stage-events.jsonl').read_text().splitlines()]
        self.assertEqual(events[-1]['stopReason'], 'signal')

    def test_signal_stops_all_owned_stage_groups(self):
        runner.CHILDREN.update({pid: type('Process', (), {'pid': pid})() for pid in (12345, 12346)})
        with patch.object(runner.os, 'killpg') as kill:
            runner.signal_stop(runner.signal.SIGTERM, None)
        self.assertTrue(runner.STOP.is_set())
        self.assertEqual([call.args for call in kill.call_args_list],
                         [(12345, runner.signal.SIGTERM), (12346, runner.signal.SIGTERM)])
        with patch.object(runner, 'verify_manifest') as verify:
            with self.assertRaises(InterruptedError):
                runner.run_stage('score', '2026-07')
            verify.assert_not_called()

    def test_completed_inputs_require_amended_population_and_hash(self):
        path = self.directory / 'positions-2026-07.jsonl.gz'
        path.write_bytes(b'synthetic')
        meta = {'complete': True, 'run': 'full', 'datasetKind': 'amended',
                'outputSha256': runner.hashlib.sha256(path.read_bytes()).hexdigest()}
        manifest = self.directory / 'positions-2026-07.json'
        manifest.write_text(json.dumps(meta))
        self.assertTrue(runner.complete('positions', '2026-07'))
        for kind in ('literal', 'alternative'):
            manifest.write_text(json.dumps({**meta, 'datasetKind': kind}))
            with self.assertRaises(ValueError):
                runner.complete('positions', '2026-07')
        manifest.write_text(json.dumps(meta))
        path.write_bytes(b'changed')
        with self.assertRaises(ValueError):
            runner.complete('positions', '2026-07')

if __name__ == '__main__':
    unittest.main()
