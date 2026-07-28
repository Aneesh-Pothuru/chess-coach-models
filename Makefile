PYTHON ?= .venv/bin/python
PIP ?= .venv/bin/pip
CONFIG ?= configs/config.yaml
PYTHON_BOOTSTRAP ?= $(shell command -v python3.12 2>/dev/null || command -v python3)

.PHONY: setup data train eval reports test all benchmark

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

reports:
	$(PYTHON) scripts/generate_reports.py --config $(CONFIG)

test:
	$(PYTHON) -m pytest

all: setup data eval reports
