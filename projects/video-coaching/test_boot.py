"""The rule compares unrounded estimates and interval bounds."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / 'bin'))
from common import boot


class BootstrapPrecision(unittest.TestCase):
    def test_length_just_over_cap_fails(self):
        result = boot({'day': [130.04 / 100]}, n=40)
        self.assertGreater(result['est'], 1.3)

    def test_positive_interval_stays_above_zero(self):
        result = boot({'day': [0.0004]}, n=40)
        self.assertGreater(result['lo'], 0)

    def test_negative_interval_stays_below_zero(self):
        result = boot({'day': [-0.0004]}, n=40)
        self.assertLess(result['hi'], 0)


if __name__ == '__main__':
    unittest.main()
