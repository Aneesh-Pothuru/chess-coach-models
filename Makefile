PYTHON ?= .venv/bin/python
PIP ?= .venv/bin/pip
CONFIG ?= configs/config.yaml

.PHONY: setup data train eval reports test all

setup:
	test -d .venv || /opt/homebrew/bin/python3.12 -m venv .venv
	$(PIP) install --upgrade pip setuptools wheel
	$(PIP) install -r requirements.txt

data:
	bash scripts/stream_data.sh $(CONFIG)

train:
	$(PYTHON) scripts/train_hazard.py --config $(CONFIG)
	$(PYTHON) scripts/build_repertoire.py --config $(CONFIG)

eval:
	$(PYTHON) scripts/run_evals.py --config $(CONFIG)

reports:
	$(PYTHON) scripts/generate_reports.py --config $(CONFIG)

test:
	$(PYTHON) -m pytest

all: setup data train eval reports

