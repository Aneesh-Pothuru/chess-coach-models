"""Synthetic data-filter tests; no database games or scores are read."""
import io
import unittest
from stream import keep, pgn_records

MOVES = ' '.join(f'{i + 1}. ' + ('Nf3 Nf6' if i % 2 == 0 else 'Ng1 Ng8') for i in range(16)) + ' 1/2-1/2'
HEADERS = dict(Event='Rated Rapid game', Site='synthetic', WhiteElo='1250', BlackElo='1649',
               TimeControl='600+0', Termination='Normal', Result='1/2-1/2')

class StreamTest(unittest.TestCase):
    def test_literal_filter_without_evals_or_clocks(self):
        row = keep(HEADERS, MOVES)
        self.assertEqual(row['plies'], 32)
        self.assertFalse(any(k in row for k in ('White', 'Black', 'Site')))
        for key, value in [('WhiteElo', '1249'), ('BlackElo', '1650'), ('Event', 'Casual Rapid game'),
                           ('TimeControl', '600+1'), ('Variant', 'Chess960'), ('Termination', 'Abandoned')]:
            self.assertIsNone(keep({**HEADERS, key: value}, MOVES))
        self.assertIsNotNone(keep({**HEADERS, 'Termination': 'Time forfeit'}, MOVES))
        self.assertIsNone(keep(HEADERS, '1. e4 e5 1/2-1/2'))

    def test_multiline_file_order_and_comments(self):
        header = '\n'.join(f'[{k} "{v}"]' for k, v in HEADERS.items())
        text = header + '\n\n' + MOVES.replace('8. ', '\n8. ') + '\n\n' + header + '\n\n1. e4 e5 *\n'
        rows = list(pgn_records(io.StringIO(text)))
        self.assertEqual(len(rows), 2)
        self.assertEqual(keep(*rows[0])['plies'], 32)
        self.assertIsNone(keep(*rows[1]))

if __name__ == '__main__':
    unittest.main()
