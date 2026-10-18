import assert from 'node:assert/strict';
import test from 'node:test';
import { bounds, forms, visibleFields } from './grader-impact.mjs';

test('counts whole decimal sentences, zero, signs, and mate-too without punctuation', () => {
  assert.deepEqual(forms(['The eval moved to +1.2. The eval moved to 0.0. The eval moved to -1.2.',
    'After Rb1, they mate in 1 too', 'After O-O, you mate in 3 too.',
    'The eval moved to M3.', 'The eval moved to 0. The eval moved to -3.', 'After Rb1, they mate in 1 instead.']),
  { eval:5, positive:1, zero:2, negative:2, mateToo:2 });
});

test('does not count a hidden fallback or a folded grade as a graded field', () => {
  const c = { texts:{ cardShows:'lesson', commentFor:'The eval moved to -1.2.',
    lessonFor:{ headline:'A lesson.', grade:'The eval moved to 0.0.', difference:['After Rb1, they mate in 1 too'] } } };
  assert.equal(forms(visibleFields(c)).eval, 0);
  assert.equal(forms(visibleFields(c)).mateToo, 1);
  c.texts.cardShows = 'comment';
  assert.equal(forms(visibleFields(c)).eval, 1);
  assert.equal(forms(visibleFields(c)).mateToo, 0);
});

test('unknown changed failures can cross an equal grade gate', () => {
  const a={id:'synthetic',textHash:'old',faithful:0}, b={id:'synthetic',textHash:'new',faithful:0};
  const bound=bounds(new Map([[a.id,a]]),[b],new Map());
  assert.equal(bound.lower,-1); assert.equal(bound.upper,1);
  const observed = new Map([['synthetic:old',{eval:0,mateToo:0}],['synthetic:new',{eval:0,mateToo:0}]]);
  assert.equal(bounds(new Map([[a.id,a]]),[b],observed).lower,0);
});

test('identical paired text cancels even when no text snapshot survives', () => {
  const a={id:'synthetic',textHash:'same',faithful:0};
  const b=bounds(new Map([[a.id,a]]),[a],new Map());
  assert.equal(b.lower,0); assert.equal(b.upper,0); assert.equal(b.changed,0);
});
