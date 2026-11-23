# How a paper is written

The lab's papers follow the conventions of published machine-learning papers, so that a reader who
knows the field can read one without learning the lab's own vocabulary. This page is the style
every paper keeps. [`docs/design.md`](design.md), "The paper", says how a paper is built.

## Structure

A model's paper has these sections, in this order, under these names:

1. **Abstract**: the task, the data, the method, the headline result with its confidence interval
   beside the baselines, and the main limitation. One paragraph.
2. **Introduction**: why the task matters, what is predicted from what, and a short list of
   contributions and findings.
3. **Related Work**: what is published on the task, and how this work differs.
4. **Task and Data**: the label's definition, the source, the filters, the split, and the
   dataset's statistics.
5. **Methods**: input representation, baselines, neural architectures, training.
6. **Evaluation Protocol**: metrics, confidence intervals, the paired test, calibration.
7. **Results**: main results first, then ablations (features, training schedule, pretraining,
   architecture, training-set size).
8. **Error Analysis**: where the best model is right and wrong, with example positions.
9. **Practical Use**, **Limitations**, **Reproducibility**, **Conclusion and Future Work**.
10. **Appendix**: every pairwise comparison, hyperparameters, feature lists, full tables.

The lab's own paper has the same shape, with a section of cross-task results and a short section
for each task.

## Voice

- First person plural and active voice: "we train", "we find". Present tense for what a result
  shows, past tense for what was done.
- A paragraph opens with its claim. The evidence follows with its number, its unit and its 95%
  confidence interval. Interpretation comes last and is marked as one: "we hypothesise",
  "a plausible explanation is", "this is consistent with".
- A difference whose confidence interval contains zero is "not statistically significant". It is
  never described as a gain or a loss.
- Section headings are noun phrases that name the content. No questions, no slogans.
- No aphorisms, no personified models ("the trees lean on"), no paired contrasts made for rhythm,
  no rhetorical questions. Say the thing once, plainly.
- Define a term or an abbreviation on first use and keep it. Do not vary a term for style.
- A person in an example is "the player". The side to move is "the mover", defined where it first
  appears, since the tables, the figures and the feature names all use it.
- A task is named in words ("blunder hazard"), with a capital in a table or a figure. A model's
  identifier is set in monospace.

## Terms

Use the standard term. The names on the left are the repository's own, and they stay in code,
configs and cards.

| In the repository | In a paper |
|---|---|
| run | model, configuration (a *run* is one training run of a configuration) |
| learner | model class |
| `constant`, the floor | constant baseline (predicts the training mean, median or base rate) |
| `gbm-*`, the trees | gradient-boosted decision trees (GBDT) |
| `gbm-hand`, the reference | the GBDT baseline with hand-crafted features |
| hand features | hand-crafted features |
| context numbers | scalar context features |
| marks | auxiliary input planes |
| body, head | encoder, prediction head |
| tower | residual convolutional network (ResNet) |
| shape of a network | architecture |
| a start from another run's body | initialisation from a pretrained encoder, pretraining |
| from nothing | from random initialisation, from scratch |
| attention told the attacks | attack-aware attention bias |
| offsets, geometry | relative position bias |
| study | ablation |
| larger build, more games | larger training set (2x, 4x) |
| today's games | the standard training set |
| kept, the lab's rule | accepted, the acceptance criterion |
| beyond the noise | statistically significant (the 95% CI of the paired difference excludes zero) |
| inside the noise | not statistically significant |
| interval | confidence interval (CI) |
| rows, valid rows, test rows | examples, validation set, test set |
| closer look | error analysis |
| first right | top-1 accuracy |
| a reading | a hypothesis |

A configuration's identifier (`transformer-medium-hand-pretrained`) is set in monospace and is
introduced with a description the first time it appears.

## Numbers

No number is typed: every value is read with `\V{key}`, and every table and figure with
`\block{name}`. Report a score with its unit and its 95% confidence interval. Report a comparison
as a paired difference with its interval, and say what the baseline is.

A gain is signed, and positive when the first model is better whatever the metric: write "a gain of
+25.49 rating points of RMSE", never "reduces RMSE by +25.49". A count over tasks comes from a
generated phrase ("nine of the ten tasks"). Where one task is compared alone, read the pair's own
verdict (`pair.<model>.<baseline>.verdict`) and not the phrase for a count of one.
