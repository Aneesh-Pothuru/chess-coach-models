PYTHON ?= .venv/bin/python
PIP ?= .venv/bin/pip
LAB ?= .venv/bin/lab
CONFIG ?= configs/config.yaml
PYTHON_BOOTSTRAP ?= $(shell command -v python3.12 2>/dev/null || command -v python3)

# The models on the shared harness (src/chess_coach_models, docs/design.md).
STARTERS := puzzle-difficulty blunder-hazard think-time

.PHONY: setup test smoke starters report chess parity papers data train eval benchmark concepts reports

setup:
	test -d .venv || $(PYTHON_BOOTSTRAP) -m venv .venv
	$(PIP) install --upgrade pip setuptools wheel
	$(PIP) install -r requirements.txt

test:
	$(PYTHON) -m pytest

# Every starter model end to end on a small sample: a check that the code runs.
# It writes under artifacts/smoke/ and is never a result.
smoke:
	for model in $(STARTERS); do $(LAB) all $$model --smoke || exit 1; done

# The full datasets, every run this machine can train, the leaderboards and
# the README's table. Runs marked `needs: cuda` wait for a GPU (docs/compute.md).
starters:
	for model in $(STARTERS); do $(LAB) all $$model || exit 1; done
	$(LAB) report

report:
	$(LAB) report

# The bridge to the app's own code (CLAUDE.md, "The bridge to the app").
chess:
	bridge/checkout.sh
	bridge/checkout.sh records

parity:
	$(PYTHON) bridge/winprob-parity/parity.py

# The one study of the app's code still here: its numbers, then its PDF.
papers:
	bridge/run.sh projects/learner-solve-chance/paper/generate.mjs
	cd projects/learner-solve-chance/paper && latexmk -pdf -interaction=nonstopmode -halt-on-error paper.tex

# The first pipeline (the 2019 models), kept as it ran. They need zstd and Stockfish.
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
