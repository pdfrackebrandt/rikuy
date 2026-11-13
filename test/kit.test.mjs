// The pure parts of the ribbon's kit (src/ui/kit.js): lengths read in any unit TeX takes and
// converted, colours under their xcolor names and what a name needs in the preamble.
import assert from 'node:assert/strict';
import { parseLength, convert, formatLength, BASE_COLORS, DVIPS_COLORS, STANDARD_COLORS, colorNeeds, colorArg } from '../src/ui/kit.js';

let n = 0;
const ok = (name, f) => { try { f(); n++; } catch (e) { console.error('FAIL', name); throw e; } };

ok('lengths: a number and a unit, a comma for a point, the field\'s unit when none is typed', () => {
  assert.deepEqual(parseLength('2.5cm'), { value: 2.5, unit: 'cm' });
  assert.deepEqual(parseLength(' 2,5 mm '), { value: 2.5, unit: 'mm' });
  assert.deepEqual(parseLength('-3pt'), { value: -3, unit: 'pt' });
  assert.deepEqual(parseLength('.5', 'in'), { value: 0.5, unit: 'in' });
  assert.deepEqual(parseLength('0.5\\linewidth'), { value: 0.5, unit: '\\linewidth' });
  for (const bad of ['', 'cm', '2 parsecs', '1e5cm', '2cm;', '\\x']) assert.equal(parseLength(bad), null, bad);
});

ok('converted through TeX\'s points', () => {
  assert.deepEqual(convert({ value: 2.54, unit: 'cm' }, 'in'), { value: 1, unit: 'in' });
  assert.deepEqual(convert({ value: 1, unit: 'in' }, 'pt'), { value: 72.27, unit: 'pt' });
  assert.deepEqual(convert({ value: 10, unit: 'mm' }, 'cm'), { value: 1, unit: 'cm' });
  assert.deepEqual(convert({ value: 0.5, unit: '\\linewidth' }, 'cm'), { value: 0.5, unit: '\\linewidth' });
  assert.equal(formatLength({ value: 1.23456, unit: 'cm' }), '1.235cm');
});

ok('colours: xcolor\'s own names need nothing, dvipsnames\' need the option, any other is HTML', () => {
  assert.equal(BASE_COLORS.length, 19);
  assert.equal(DVIPS_COLORS.length, 68);
  assert.equal(STANDARD_COLORS.length, 10);
  assert.ok([...BASE_COLORS, ...DVIPS_COLORS].every(([, hex]) => /^[0-9A-F]{6}$/.test(hex)));
  assert.equal(colorNeeds('red'), null);
  assert.equal(colorNeeds('ForestGreen'), 'dvipsnames');
  assert.equal(colorNeeds('accent'), null);
  for (const [name] of STANDARD_COLORS) assert.ok(BASE_COLORS.some(([x]) => x === name) || DVIPS_COLORS.some(([x]) => x === name), name);
  assert.deepEqual(colorArg({ name: 'red' }), { model: null, value: 'red' });
  assert.deepEqual(colorArg({ html: '#c00000' }), { model: 'HTML', value: 'C00000' });
});

console.log('kit: ' + n + ' groups of checks passed');
