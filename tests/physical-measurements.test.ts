import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dimensionSchema, elevationSchema, coordinateMeasurementSchema, unknownMeasurement } from '../shared/domain/measurements';
import { formatMeasurement, parseMeasurement, type ParseOptions } from '../shared/domain/parseMeasurement';
import { fromMm, fromMm2, mmSchema, mm2Schema, toMm, toMm2, sameLength } from '../shared/domain/units';

function parsed(input: string, options?: ParseOptions) {
  const result = parseMeasurement(input, options);
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error(result.message);
  return result.measurement;
}
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, actual + ' != ' + expected);

test('explicit feet and inches use physical millimeters', () => {
  close(parsed('12 ft').valueMm, 3657.6);
  close(parsed('32 in').valueMm, 812.8);
  close(fromMm(toMm(32, 'in'), 'in'), 32);
});

test('compound feet/inches, decimal feet and metric inputs agree', () => {
  for (const input of ['12 ft 6 in', '12.5 ft', '3810 mm', '381 cm', '3.81 m', '12\' 6"', '12′ 6″']) {
    close(parsed(input).valueMm, 3810);
  }
});

test('long unit names, uppercase and decimal metric inputs are explicit', () => {
  for (const input of ['32 INCHES', '32 inch', '812.8 millimeters', '81.28 centimetres', '.8128 meter']) {
    close(parsed(input).valueMm, 812.8);
  }
});

test('fractional inch source and denominator retain intended precision', () => {
  const measurement = parsed('  32 3/8 in  ');
  close(measurement.valueMm, 822.325);
  assert.equal(measurement.provenance.input, '  32 3/8 in  ');
  assert.deepEqual(measurement.provenance.components, [{
    text: '32 3/8', unit: 'in', precision: { kind: 'fraction', denominator: 8 },
  }]);
  close(parsed('3/2 in').valueMm, 38.1);
  close(parsed('1/64 in').valueMm, 0.396875);
});

test('compound fractional inches retain each component and do not snap', () => {
  const measurement = parsed('12 ft 6 1/8 in');
  close(measurement.valueMm, 3813.175);
  assert.deepEqual(measurement.provenance.components.map(part => part.precision), [
    { kind: 'decimal', decimalPlaces: 0 }, { kind: 'fraction', denominator: 8 },
  ]);
  assert.equal(measurement.provenance.unit, 'ft-in');
  assert.equal(measurement.provenance.confirmation.status, 'unconfirmed');
});

test('equal decimal values retain distinct input precision', () => {
  const a = parsed('12.50 ft'), b = parsed('12.5 ft');
  assert.equal(a.valueMm, b.valueMm);
  assert.deepEqual(a.provenance.components[0].precision, { kind: 'decimal', decimalPlaces: 2 });
  assert.deepEqual(b.provenance.components[0].precision, { kind: 'decimal', decimalPlaces: 1 });
  assert.notEqual(a.provenance.input, b.provenance.input);
});

test('bare input needs a unit; explicit suffix takes precedence', () => {
  assert.deepEqual(parseMeasurement('32'), { ok: false, code: 'missing-unit', message: 'Select a unit for a bare value' });
  close(parsed('32', { selectedUnit: 'in' }).valueMm, 812.8);
  close(parsed('1/2', { selectedUnit: 'in' }).valueMm, 12.7);
  close(parsed('32 in', { selectedUnit: 'mm' }).valueMm, 812.8);
  assert.equal(parseMeasurement(32, { selectedUnit: 'in' }).ok, false);
  assert.equal(parseMeasurement('32', { selectedUnit: 'yd' as 'ft' }).ok, false);
});

test('invalid dimensions reject zero and negative values', () => {
  for (const input of ['0 mm', '-1 m', '-12 ft 6 in', '0/8 in']) assert.equal(parseMeasurement(input).ok, false, input);
  assert.equal(dimensionSchema.safeParse({ ...parsed('1 mm'), valueMm: 0 }).success, false);
});

test('zero elevation and negative presentation coordinate are valid distinct contexts', () => {
  const zero = parsed('0 in', { kind: 'elevation' });
  assert.equal(elevationSchema.safeParse(zero).success, true);
  assert.equal(parseMeasurement('-1 in', { kind: 'elevation' }).ok, false);
  const negative = parsed('-12 ft 6 in', { kind: 'coordinate' });
  close(negative.valueMm, -3810);
  assert.equal(coordinateMeasurementSchema.safeParse(negative).success, true);
});

test('unknown values remain explicit and cannot carry a fabricated zero', () => {
  const unknown = unknownMeasurement('Not recorded');
  assert.equal(dimensionSchema.safeParse(unknown).success, true);
  assert.equal(elevationSchema.safeParse(unknown).success, true);
  assert.equal(unknown.valueMm, null);
  assert.equal(dimensionSchema.safeParse({ ...unknown, valueMm: 0 }).success, false);
});

test('malformed and partially parsed strings fail rather than truncating', () => {
  for (const input of ['', ' ', '12 ft garbage', '12feet6', '12. ft', 'ft 12', '12 ft 6', '12 6 in',
    '1e3 mm', '0x10 in', '1,000 mm', '12 ft 3 in 2 in', '12 ft ft', '12 ft -6 in', '12.5 ft 6 in',
    '12 ft 12 in', '--2 in', '12 in 3 ft', '3 yd', '3 px', '3 meters extra']) {
    assert.equal(parseMeasurement(input).ok, false, input);
  }
});

test('invalid fractions and fractions in unsupported units reject', () => {
  for (const input of ['1/0 in', '1/-8 in', '1/2.5 in', '1.5/2 in', '1//2 in', '1/2/3 in',
    '1 3/2 in', '1/2 ft', '1/2 mm', '1/9007199254740992 in']) {
    assert.equal(parseMeasurement(input).ok, false, input);
  }
});

test('nonfinite, overflow and unrepresentable precision fail explicitly', () => {
  for (const input of ['NaN mm', 'Infinity in', '-Infinity ft', '9'.repeat(310) + ' m',
    '9007199254740993 mm', '9007199254740991 1/2 in', '12.000000000000000000001 ft']) {
    assert.equal(parseMeasurement(input).ok, false, input);
  }
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.equal(mmSchema.safeParse(value).success, false);
    assert.equal(mm2Schema.safeParse(value).success, false);
    assert.throws(() => toMm(value, 'ft'));
  }
  close(parsed('1000000 mm').valueMm, 1000000);
});

test('formatting rounds display only and requires valid precision', () => {
  const measurement = parsed('32 3/8 in');
  const before = structuredClone(measurement);
  assert.equal(formatMeasurement(measurement.valueMm, 'in', 2), '32.38 in');
  assert.equal(formatMeasurement(measurement.valueMm, 'mm', 3), '822.325 mm');
  assert.deepEqual(measurement, before);
  assert.throws(() => formatMeasurement(measurement.valueMm, 'in', -1));
  assert.throws(() => formatMeasurement(measurement.valueMm, 'in', 1.5));
});

test('square units convert separately and never use a length factor once', () => {
  close(toMm2(1, 'ft'), 92903.04);
  close(toMm2(120, 'ft'), 11148364.8);
  close(fromMm2(toMm2(120, 'ft'), 'ft'), 120);
  assert.equal(toMm2(1, 'm'), 1_000_000);
  assert.equal(toMm2(0, 'm'), 0);
  assert.throws(() => toMm2(-1, 'm'));
});

test('physical comparison tolerance does not quantize stored values', () => {
  const a = toMm(812.8, 'mm'), b = toMm(812.805, 'mm');
  assert.equal(sameLength(a, b), true);
  assert.equal(sameLength(a, toMm(812.82, 'mm')), false);
  assert.equal(b, 812.805);
  assert.throws(() => sameLength(a, b, -1));
});
