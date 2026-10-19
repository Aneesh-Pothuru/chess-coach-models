PYTHON ?= .venv/bin/python
PIP ?= .venv/bin/pip
CONFIG ?= configs/config.yaml
PYTHON_BOOTSTRAP ?= $(shell command -v python3.12 2>/dev/null || command -v python3)

.PHONY: setup data train eval reports test all benchmark concepts chess parity papers

setup:
	test -d .venv || $(PYTHON_BOOTSTRAP) -m venv .venv
	$(PIP) install --upgrade pip setuptools wheel
	$(PIP) install -r requirements.txt

data:
	bash scripts/stream_data.sh $(CONFIG)

train:
	$(PYTHON) scripts/train_hazard.py --config $(CONFIG)
	$(PYTHON) scripts/add_maia_features.py --config $(CONFIG)
	$(PYTHON) scripts/train_hazard.py --config $(CONFIG) --with-maia
	$(PYTHON) scripts/build_repertoire.py --config $(CONFIG)

eval:
	$(PYTHON) scripts/run_evals.py --config $(CONFIG)

benchmark:
	bash scripts/stream_benchmark.sh $(CONFIG)
	$(PYTHON) scripts/benchmark_maia.py --config $(CONFIG) --stage infer

concepts:
	bash scripts/stream_puzzles.sh $(CONFIG)
	$(PYTHON) scripts/train_concepts.py --config $(CONFIG)

reports:
	$(PYTHON) scripts/generate_reports.py --config $(CONFIG)

test:
	$(PYTHON) -m pytest

chess:
	bridge/checkout.sh
	bridge/checkout.sh records

parity:
	$(PYTHON) projects/winprob-parity/parity.py

# Each paper's numbers from what its project last wrote, then its PDF. The
# projects' reproductions come first (projects/README.md gives the order).
PAPERS := accuracy-vs-chesscom explain-top-move judge-in-context maia-punish maia-rating-offset maia-calibration winprob-parity focus-backtest detector-themes drill-decks think-time-rapid praise-gate learner-solve-chance band-above phone-vs-routine book-advice period-writer findable-move judge-factors his-habits positions-like-this

papers:
	bridge/run.sh projects/accuracy-vs-chesscom/paper/generate.mjs
	bridge/run.sh projects/explain-top-move/paper/generate.mjs
	bridge/run.sh projects/judge-in-context/paper/generate.mjs
	bridge/run.sh projects/maia-punish/paper/generate.mjs
	bridge/run.sh projects/maia-rating-offset/paper/generate.mjs
	bridge/run.sh projects/maia-calibration/paper/generate.mjs
	$(PYTHON) projects/winprob-parity/paper/generate.py
	bridge/run.sh projects/focus-backtest/paper/generate.mjs
	bridge/run.sh projects/detector-themes/paper/generate.mjs
	bridge/run.sh projects/drill-decks/paper/generate.mjs
	bridge/run.sh projects/think-time-rapid/paper/generate.mjs
	bridge/run.sh projects/praise-gate/paper/generate.mjs
	bridge/run.sh projects/learner-solve-chance/paper/generate.mjs
	bridge/run.sh projects/band-above/paper/generate.mjs
	bridge/run.sh projects/phone-vs-routine/paper/generate.mjs
	bridge/run.sh projects/book-advice/paper/generate.mjs
	bridge/run.sh projects/period-writer/paper/generate.mjs
	bridge/run.sh projects/findable-move/paper/generate.mjs
	bridge/run.sh projects/judge-factors/paper/generate.mjs
	bridge/run.sh projects/his-habits/paper/generate.mjs
	bridge/run.sh projects/positions-like-this/paper/generate.mjs
	for p in $(PAPERS); do (cd projects/$$p/paper && latexmk -pdf -interaction=nonstopmode -halt-on-error paper.tex) || exit 1; done

all: setup data eval reports
