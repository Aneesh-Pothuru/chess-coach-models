#!/usr/bin/env python3
"""Check publication replay and reject changed frozen inputs without private data."""
from __future__ import annotations

import importlib.util
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

PROJECT = Path(__file__).resolve().parent
LAB = PROJECT.parents[1]
spec = importlib.util.spec_from_file_location('budget_freeze', PROJECT / 'freeze.py')
freeze = importlib.util.module_from_spec(spec)
spec.loader.exec_module(freeze)


class FreezeReplayTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix='think-time-budget-freeze-', dir='/tmp')
        self.addCleanup(temporary.cleanup)
        self.lab = Path(temporary.name)
        self.project = self.lab / 'projects/think-time-budget'
        self.manifest = json.loads((PROJECT / 'freeze-manifest.json').read_text())
        paths = {entry['path'] for entry in self.manifest['files']}
        paths.update(freeze.SNAPSHOTS.values())
        paths.add('projects/think-time-budget/freeze-manifest.json')
        for relative in paths:
            destination = self.lab / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(LAB / relative, destination)
        patched = patch.multiple(freeze, LAB=self.lab, PROJECT=self.project,
                                 MANIFEST=self.project / 'freeze-manifest.json')
        patched.start()
        self.addCleanup(patched.stop)

    def test_published_tree_checks_the_original_snapshots(self):
        self.assertNotEqual((self.project / 'README.md').read_bytes(),
                            (self.project / 'phase1/README.md').read_bytes())
        self.assertEqual(freeze.check_manifest(), self.manifest)

    def test_changed_archived_readme_is_rejected(self):
        snapshot = self.project / 'phase1/README.md'
        snapshot.write_bytes(snapshot.read_bytes() + b'\nchanged rule\n')
        with self.assertRaisesRegex(ValueError, 'frozen content changed: .*README.md'):
            freeze.check_manifest()

    def test_live_analysis_cannot_hide_behind_an_extra_snapshot(self):
        analysis = self.project / 'analyze.py'
        shutil.copyfile(analysis, self.project / 'phase1/analyze.py')
        analysis.write_bytes(analysis.read_bytes() + b'\n# changed estimator\n')
        with self.assertRaisesRegex(ValueError, 'frozen content changed: .*analyze.py'):
            freeze.check_manifest()

    def test_missing_original_checker_is_rejected(self):
        (self.project / 'phase1/freeze.py').unlink()
        with self.assertRaisesRegex(ValueError, 'freeze input is missing: .*freeze.py'):
            freeze.check_manifest()


if __name__ == '__main__':
    unittest.main()
