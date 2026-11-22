PYTHON ?= .venv/bin/python
PIP ?= .venv/bin/pip
LAB ?= .venv/bin/lab
PYTHON_BOOTSTRAP ?= $(shell command -v python3.12 2>/dev/null || command -v python3)

# Every model on the harness: a folder under models/ with a task.yaml.
MODELS := $(patsubst models/%/task.yaml,%,$(wildcard models/*/task.yaml))

# The models whose paper has its prose.
PAPERS := $(patsubst models/%/paper/paper.tex,%,$(wildcard models/*/paper/paper.tex))

.PHONY: setup test smoke models report chess parity papers study-paper

setup:
	test -d .venv || $(PYTHON_BOOTSTRAP) -m venv .venv
	$(PIP) install --upgrade pip setuptools wheel
	$(PIP) install -r requirements.txt

test:
	$(PYTHON) -m pytest

# Every model end to end on a small sample: a check that the code runs.
# It writes under artifacts/smoke/ and is never a result.
smoke:
	for model in $(MODELS); do $(LAB) all $$model --smoke || exit 1; done

# The full datasets, every run this machine can train, the leaderboards and
# the README's table. Runs marked `needs: cuda` wait for a GPU (docs/compute.md).
models:
	for model in $(MODELS); do $(LAB) all $$model || exit 1; done
	$(LAB) report

report:
	$(LAB) report

# The bridge to the app's own code (CLAUDE.md, "The bridge to the app").
chess:
	bridge/checkout.sh
	bridge/checkout.sh records

parity:
	$(PYTHON) bridge/winprob-parity/parity.py

# Every model's paper, drawn from its committed results and compiled (needs LaTeX).
papers:
	for model in $(PAPERS); do $(LAB) paper $$model || exit 1; done

# The one study of the app's code still here: its numbers, then its PDF.
study-paper:
	bridge/run.sh projects/learner-solve-chance/paper/generate.mjs
	cd projects/learner-solve-chance/paper && latexmk -pdf -interaction=nonstopmode -halt-on-error paper.tex
