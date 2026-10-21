"""A partial batch must not pass the controls condition."""
import contextlib
import io
import json
import sys
import tempfile
import unittest
import warnings
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent / 'bin'))
import batch


class ReportControls(unittest.TestCase):
    def report(self, same_days, decoy_days):
        days = ['train-day', 'held-day']
        with tempfile.TemporaryDirectory(dir='/tmp') as tmp:
            root = Path(tmp)

            def write(path, value):
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(json.dumps(value))

            tied = {'final': dict.fromkeys(batch.CRITERIA, 'tie')}
            for day in days:
                write(root / 'cases' / day / 'meta' / 'case.json', {'usable': True})
                for config in ['baseline', 'candidate']:
                    run = root / 'runs' / config / day / 'r1'
                    write(run / 'grade.json', {'final': {'ok': True}, 'shape': {'seconds': 100}})
                    write(run / 'audit.json', {
                        'counts': {'false': 0},
                        'tally': {'boardClaimsFalse': 0,
                                  **{k: [int(config == 'candidate'), 1] for k in batch.MOVES}},
                    })
                base = root / 'runs' / 'baseline' / day / 'r1'
                write(base / 'judge-vs-baseline.json', tied)
                write(root / 'runs' / 'candidate' / day / 'r1' / 'judge-vs-baseline.json',
                      {'final': dict.fromkeys(batch.CRITERIA, 'candidate')})
                if day in same_days:
                    write(base / 'judge-control-same.json', tied)
                if day in decoy_days:
                    write(base / 'judge-control-decoy.json', tied)
            with warnings.catch_warnings(), \
                    patch.multiple(batch, EVAL=tmp, CASES=str(root / 'cases'), RUNS=str(root / 'runs'),
                                IDS=days, TRAIN=days[:1], HELD_OUT=days[1:]), \
                    patch.object(batch, 'spent', return_value=0), contextlib.redirect_stdout(io.StringIO()):
                warnings.simplefilter('ignore', ResourceWarning)
                batch.cmd_report(['--config', 'candidate', '--vs', 'baseline'])
            return json.loads((root / 'reports' / 'candidate-vs-baseline.json').read_text())

    def test_missing_controls_cannot_keep_candidate(self):
        report = self.report([], [])
        self.assertFalse(report['rule']['6 controls clean'])
        self.assertFalse(report['kept'])

    def test_each_control_must_cover_every_day(self):
        days = ['train-day', 'held-day']
        for same, decoy in [(days[:1], days), (days, days[:1])]:
            with self.subTest(same=same, decoy=decoy):
                self.assertFalse(self.report(same, decoy)['rule']['6 controls clean'])

    def test_complete_clean_controls_still_pass(self):
        days = ['train-day', 'held-day']
        self.assertTrue(self.report(days, days)['kept'])


if __name__ == '__main__':
    unittest.main()
