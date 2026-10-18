"""Fixed design; shared by the count-only pass and the later effect pass."""
from __future__ import annotations
import numpy as np
import pandas as pd
import lightgbm as lgb

PRIMARY = (1100, 1600)  # half-open: includes fractional means below 1600
TRIGGERS = ['book-end', 'conversion', 'forcing', 'structure']
CANDIDATES = ['in-check', 'after-capture', 'own-hanging', 'opp-hanging',
              'after-opp-error', 'defending', 'early', 'high-danger']
FEATURES = ['rating', 'oppRating', 'ply', 'sinceBook', 'evalBefore', 'wpBefore',
            'phaseCode', 'material', 'legalMoves', 'forcing', 'hangingOwn', 'hangingOpp',
            'inCheck', 'prevCapture', 'afterOppError', 'afterOwnError', 'black']
PARAMS = dict(objective='binary', n_estimators=400, learning_rate=0.05, num_leaves=31,
              min_child_samples=200, subsample=0.8, subsample_freq=1, colsample_bytree=0.8,
              reg_lambda=1.0, random_state=0, n_jobs=1, verbose=-1,
              deterministic=True, force_row_wise=True)
RULE = dict(primaryLo=1100, primaryHiExclusive=1600, minClock=60, strata=5, folds=5,
            draws=4000, seed=20261018, alpha=.05, minPlayers=200, minCoverage=.8,
            thinkFloorSeconds=2, placeboSeconds=5, placeboMargin=.01,
            highDangerQuantile=.8, defendingCp=-300, earlyOwnMoves=4,
            slowMinBase=600, slowMinBudget=900, budgetIncrementMultiplier=40,
            foldEncoding='first 8 hex digits of SHA256(casefold username), modulo 5',
            triggers=TRIGGERS, candidates=CANDIDATES, features=FEATURES, model=PARAMS)


def fold_of(player: str) -> int:
    return int(player[:8], 16) % RULE['folds']


def prepare(d: pd.DataFrame) -> pd.DataFrame:
    d = d.copy()
    d['trigger'] = d['trigger'].fillna('none')
    d['phaseCode'] = d['phase'].map({'opening': 0, 'middlegame': 1, 'endgame': 2})
    d['black'] = (d['color'] == 'b').astype('int8')
    d['sinceBook'] = d['ply'] - d['bookExitPly']
    # Derive each side's book-end ply from ALL timed rows, as the predecessor does.
    ends = d.loc[d.trigger == 'book-end'].groupby(['game', 'color'], observed=True).ply.min()
    d['endPly'] = pd.MultiIndex.from_frame(d[['game', 'color']]).map(ends)
    return d.loc[d.think.notna() & d.graded.eq(1) & d.nonTrivial.eq(1)
                 & d.clockBefore.ge(RULE['minClock'])].reset_index(drop=True)


def danger(d: pd.DataFrame, rushed: float, directory, fingerprint: str):
    """Only nuisance scores and timings. No error-rate or performance diagnostics."""
    import json
    import time
    path = directory / f'danger-{fingerprint}.npz'
    if path.exists():
        z = np.load(path)
        if len(z['score']) != len(d):
            raise ValueError('cached danger has a different row count')
        return z['score'], json.loads(str(z['timing']))
    started = time.monotonic()
    folds = d.player.map(fold_of).to_numpy()
    opp_folds = d.opponent.map(fold_of).to_numpy()
    x = d[FEATURES].to_numpy(dtype=np.float32)
    y = d.serious.to_numpy(dtype=np.int8)
    fast_quick = (d.budget.eq('fast') & d.think.lt(rushed)).to_numpy()
    score = np.full(len(d), np.nan, dtype=np.float32)
    timing = {'folds': [], 'features': FEATURES, 'params': PARAMS}
    for f in range(RULE['folds']):
        tick = time.monotonic()
        train = (folds != f) & (opp_folds != f) & fast_quick
        held = folds == f
        if not held.any():
            continue
        if len(np.unique(y[train])) != 2:
            raise ValueError('danger fold lacks both classes; no scores are fabricated')
        model_path = directory / f'danger-{fingerprint}-fold{f}.txt'
        timing_path = model_path.with_suffix('.timing.json')
        if model_path.exists():
            model = lgb.Booster(model_file=str(model_path))
            fit_seconds = json.loads(timing_path.read_text())['fitSeconds'] if timing_path.exists() else None
        else:
            fit_start = time.monotonic()
            model = lgb.LGBMClassifier(**PARAMS).fit(x[train], y[train]).booster_
            fit_seconds = time.monotonic()-fit_start
            tmp = model_path.with_suffix('.partial')
            model.save_model(str(tmp))
            timing_path.write_text(json.dumps({'fitSeconds': fit_seconds})+'\n')
            tmp.replace(model_path)
        score_start = time.monotonic()
        score[held] = model.predict(x[held], num_threads=1)
        timing['folds'].append({'fold': f, 'trainMoves': int(train.sum()),
                                'scoredMoves': int(held.sum()), 'invocationSeconds': time.monotonic()-tick,
                                'fitSeconds': fit_seconds, 'scoreSeconds': time.monotonic()-score_start})
    if not np.isfinite(score).all():
        raise ValueError('incomplete danger scores')
    timing['invocationSeconds'] = time.monotonic()-started
    if any(f['fitSeconds'] is None for f in timing['folds']):
        raise ValueError('cached model has no original timing; restore timing or refit that fold')
    timing['seconds'] = sum(f['fitSeconds']+f['scoreSeconds'] for f in timing['folds'])
    with path.with_suffix('.partial').open('wb') as out:
        np.savez_compressed(out, score=score, timing=json.dumps(timing))
    path.with_suffix('.partial').replace(path)
    return score, timing


def masks(d: pd.DataFrame, rushed: float):
    primary = d.meanRating.ge(PRIMARY[0]) & d.meanRating.lt(PRIMARY[1])
    q = d.loc[primary & d.think.lt(rushed), 'danger'].to_numpy()
    if not len(q):
        raise ValueError('no primary quick moves for high danger')
    high = float(np.quantile(q, RULE['highDangerQuantile'], method='linear'))
    result = {t: d.trigger.eq(t).to_numpy() for t in TRIGGERS + ['none']}
    result.update({
        'in-check': d.inCheck.eq(1).to_numpy(),
        'after-capture': d.prevCapture.eq(1).to_numpy(),
        'own-hanging': d.hangingOwn.gt(0).to_numpy(),
        'opp-hanging': d.hangingOpp.gt(0).to_numpy(),
        'after-opp-error': d.afterOppError.eq(1).to_numpy(),
        'defending': d.evalBefore.le(RULE['defendingCp']).to_numpy(),
        'early': (d.ply.ge(d.endPly) & d.ply.le(d.endPly + 2*RULE['earlyOwnMoves'])).to_numpy(),
        'high-danger': d.danger.ge(high).to_numpy(),
        'all': np.ones(len(d), bool),
        'placebo': d.think.lt(RULE['placeboSeconds']).to_numpy(),
    })
    return primary.to_numpy(), result, high


def cells(d: pd.DataFrame, mask: np.ndarray, *, effects=False, strata=5):
    """Matched player cells. With effects=False, never aggregate think or outcomes."""
    a = d.loc[mask].copy()
    f = a.loc[a.budget.eq('fast'), 'danger']
    cuts = np.quantile(f, np.linspace(0, 1, strata+1)[1:-1], method='linear') if len(f) else np.zeros(strata-1)
    a['stratum'] = np.searchsorted(cuts, a.danger.to_numpy(), side='right')
    keys = ['player', 'stratum', 'budget']
    n = a.groupby(keys, observed=True).size().unstack('budget', fill_value=0)
    for b in ['fast', 'slow']:
        if b not in n: n[b] = 0
    paired = a.groupby(['player', 'budget'], observed=True).size().unstack('budget', fill_value=0)
    for b in ['fast', 'slow']:
        if b not in paired: paired[b] = 0
    both = paired.index[(paired.fast > 0) & (paired.slow > 0)]
    good = n.loc[(n.fast > 0) & (n.slow > 0)]
    kept_fast = good.fast.groupby('player').sum()
    coverage = (kept_fast / paired.fast.replace(0, np.nan)).reindex(both).fillna(0)
    result = {'paired': both, 'supported': kept_fast.index, 'coverage': coverage,
              'fast': int(paired.fast.sum()), 'slow': int(paired.slow.sum()), 'cuts': cuts}
    if effects:
        if good.empty:
            result['effects'] = pd.DataFrame(columns=['err', 'think'],
                                             index=pd.Index([], name='player'), dtype=float)
            return result
        agg = a.groupby(keys, observed=True)[['serious', 'think']].mean()
        w = good.fast / kept_fast.reindex(good.index.get_level_values('player')).to_numpy()
        fast = agg.xs('fast', level='budget').reindex(good.index)
        slow = agg.xs('slow', level='budget').reindex(good.index)
        dif = (slow-fast).mul(w, axis=0).groupby('player').sum()
        result['effects'] = dif.rename(columns={'serious': 'err', 'think': 'think'})
    return result


def support(a, b=None):
    """Compare on the same players, counting unsupported paired players as lost coverage."""
    paired = a['paired'] if b is None else a['paired'].intersection(b['paired'])
    kept = a['supported'].intersection(paired)
    if b is not None: kept = kept.intersection(b['supported'])
    coverage = []
    for c in ([a] if b is None else [a, b]):
        cv = c['coverage'].reindex(paired).fillna(0)
        cv.loc[~cv.index.isin(kept)] = 0
        coverage.append(float(cv.mean()) if len(cv) else 0.)
    ok = len(kept) >= RULE['minPlayers'] and min(coverage) >= RULE['minCoverage']
    return kept, {'pairedPlayers': len(paired), 'supportedPlayers': len(kept),
                  'coverage': coverage, 'sufficient': ok}
