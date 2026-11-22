# Llama-3.2-3B-coach-narrator-n6

Built with Llama. An adapter that has Llama 3.2 3B Instruct tell a chess set-up
line out loud: two plain sentences, from facts an engine and board code have
already checked. The model card, with the prompts, the training and the
checks: https://github.com/Aneesh-Pothuru/chess-coach-models/tree/main/models/coach-narrator

| | |
|---|---|
| Adapter | LoRA, rank 16 on the attention projections, for `unsloth/Llama-3.2-3B-Instruct` |
| Weights | `adapter_model.safetensors`, 36,730,224 bytes, sha256 `079e7924b50a54e8263f6122f10a62b348c749ee10b78846eb1e245576d558fa` |
| Trained on | 1,390 narrations of set-ups from Lichess puzzles and games (CC0), written by a teacher model and kept only when they passed the training filter |
| Truth check | 75 of 75 held-out set-ups (100.0%: 10 of 10 from games, 65 of 65 from puzzles); the rule for publishing asks 97% |
| Median length | 36 words |
| Archive | `Llama-3.2-3B-coach-narrator-n6.zip`, 36,742,008 bytes, sha256 `51b593a3e188c7042020eb6dac78d5bdb47eb2db471e9468a2583f5804b09349` |

The truth check holds every move, square, number and tactic a narration names
to the facts its prompt gave. The claim audit and the blind judge have not read
this model's narrations.

## Using it

```python
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

tokenizer = AutoTokenizer.from_pretrained("unsloth/Llama-3.2-3B-Instruct")
model = PeftModel.from_pretrained(AutoModelForCausalLM.from_pretrained("unsloth/Llama-3.2-3B-Instruct"), "Llama-3.2-3B-coach-narrator-n6")
```

It answers the narration prompt that `coach-eval/coach-rewrite.mjs --task narrate`
writes from a moment's facts, and a narration is shown only when the truth
check passes it.

## Licence

Llama 3.2 is licensed under the Llama 3.2 Community License, Copyright © Meta Platforms, Inc. All Rights Reserved.
This adapter is a derivative work of Llama 3.2 and is distributed under that
licence: `LICENSE.txt` is its text and `Notice.txt` its notice. Its use must
follow Meta's Acceptable Use Policy, https://www.llama.com/llama3_2/use-policy.
