"""Truth and coaching-share guards need both scripts' audits on every period."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
import test_controls as fixtures


class ReportAudits(unittest.TestCase):
    def test_missing_audit_cannot_keep_candidate(self):
        periods = ['train-period', 'held-period']
        real_load = fixtures.batch.load
        for config in ['baseline', 'candidate']:
            def load_without_audit(path):
                missing = ('held-period' in path and config in Path(path).parts and
                           Path(path).name == 'audit.json')
                return None if missing else real_load(path)

            with self.subTest(config=config), patch.object(fixtures.batch, 'load', side_effect=load_without_audit):
                report = fixtures.ReportControls().report(periods, periods)
                self.assertEqual(report['all']['judge.coaching']['cases'], 2)
                self.assertEqual(report['all']['audit.false.minusBase']['cases'], 1)
                self.assertFalse(report['rule']['4 truth not worse'])
                self.assertFalse(report['rule']['7 coaching moves made more often'])
                self.assertFalse(report['kept'])


if __name__ == '__main__':
    unittest.main()
