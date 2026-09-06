import { z } from 'zod';
import { coordinateMeasurementSchema, dimensionSchema, elevationSchema, type KnownMeasurement,
  type MeasurementProvenance } from './measurements';
import { fromMm, lengthUnitSchema, MM_PER_UNIT, toMm, type LengthUnit, type Mm } from './units';

const optionsSchema = z.object({
  selectedUnit: lengthUnitSchema.optional(),
  kind: z.enum(['dimension', 'elevation', 'coordinate']).default('dimension'),
}).strict();
export type ParseOptions = z.input<typeof optionsSchema>;
export type ParseResult = { ok: true; measurement: KnownMeasurement } | {
  ok: false; code: 'invalid-options' | 'missing-unit' | 'invalid-syntax' | 'invalid-value'; message: string;
};
const decimal = '(?:\\d+(?:\\.\\d+)?|\\.\\d+)';
const inchNumber = `(?:\\d+\\s+\\d+/\\d+|\\d+/\\d+|${decimal})`;
const footUnit = "(?:ft|feet|foot|')";
const inchUnit = '(?:in|inches|inch|")';
const compound = new RegExp(`^(\\d+)\\s*${footUnit}\\s*(${inchNumber})\\s*${inchUnit}$`, 'i');
const single = new RegExp(`^(${inchNumber})\\s*(mm|millimeters?|millimetres?|cm|centimeters?|centimetres?|m|meters?|metres?|ft|feet|foot|'|in|inches|inch|")$`, 'i');
const bare = new RegExp(`^${inchNumber}$`);
const unitAliases: Record<string, LengthUnit> = {
  mm: 'mm', millimeter: 'mm', millimeters: 'mm', millimetre: 'mm', millimetres: 'mm',
  cm: 'cm', centimeter: 'cm', centimeters: 'cm', centimetre: 'cm', centimetres: 'cm',
  m: 'm', meter: 'm', meters: 'm', metre: 'm', metres: 'm',
  ft: 'ft', foot: 'ft', feet: 'ft', "'": 'ft', in: 'in', inch: 'in', inches: 'in', '"': 'in',
};

function numberPart(text: string, unit: LengthUnit) {
  if (text.includes('/')) {
    if (unit !== 'in') throw new Error('Fractions require inches');
    const match = /^(?:(\d+)\s+)?(\d+)\/(\d+)$/.exec(text)!;
    const whole = Number(match[1] ?? 0), numerator = Number(match[2]), denominator = Number(match[3]);
    if (![whole, numerator, denominator].every(Number.isSafeInteger) || denominator <= 0
        || (match[1] !== undefined && numerator >= denominator)) throw new Error('Invalid fraction');
    return { value: whole + numerator / denominator, component: {
      text, unit, precision: { kind: 'fraction' as const, denominator },
    } };
  }
  const value = Number(text);
  if (!Number.isFinite(value) || (value === 0 && /[1-9]/.test(text))) throw new Error('Invalid number');
  return { value, component: { text, unit, precision: {
    kind: 'decimal' as const, decimalPlaces: text.includes('.') ? text.split('.')[1].length : 0,
  } } };
}

/** Whole-string grammar only. An explicit suffix takes precedence over selectedUnit.
 * A leading sign applies to the whole feet/inches pair; inches in a pair must be <12.
 * No exponent, commas, hex, implicit unit, grid snapping or physical rounding.
 */
export function parseMeasurement(input: unknown, options: ParseOptions = {}): ParseResult {
  const parsedOptions = optionsSchema.safeParse(options);
  if (!parsedOptions.success) return { ok: false, code: 'invalid-options', message: 'Invalid measurement context' };
  if (typeof input !== 'string' || !input.trim()) {
    return { ok: false, code: 'invalid-syntax', message: 'Enter a complete measurement' };
  }
  const normalized = input.trim().replaceAll('′', "'").replaceAll('″', '"');
  const sign = normalized.startsWith('-') ? -1 : 1;
  const unsigned = /^[+-]/.test(normalized) ? normalized.slice(1) : normalized;
  const pair = compound.exec(unsigned), one = single.exec(unsigned);
  let valueMm: Mm, unit: MeasurementProvenance['unit'];
  let components: MeasurementProvenance['components'];
  try {
    if (pair) {
      const feet = numberPart(pair[1], 'ft'), inches = numberPart(pair[2], 'in');
      if (inches.value >= 12) throw new Error('Compound inches must be less than 12');
      valueMm = toMm(sign * (feet.value * 12 + inches.value), 'in');
      unit = 'ft-in'; components = [feet.component, inches.component];
    } else if (one || bare.test(unsigned)) {
      const selected = one ? unitAliases[one[2].toLowerCase()] : parsedOptions.data.selectedUnit;
      if (!selected) return { ok: false, code: 'missing-unit', message: 'Select a unit for a bare value' };
      const part = numberPart(one ? one[1] : unsigned, selected);
      valueMm = toMm(sign * part.value, selected);
      unit = selected; components = [part.component];
    } else {
      return { ok: false, code: 'invalid-syntax', message: 'Unsupported or incomplete measurement syntax' };
    }
  } catch {
    return { ok: false, code: 'invalid-value', message: 'Invalid fraction, unit or nonfinite value' };
  }
  // Reject input precision that this finite-number representation cannot retain at
  // the requested magnitude; never silently round an unsafe integer/fraction.
  for (const component of components) {
    const precision = component.precision;
    const resolution = precision.kind === 'decimal' ? 10 ** -precision.decimalPlaces
      : precision.kind === 'fraction' ? 1 / precision.denominator : 1;
    const resolutionMm = resolution * MM_PER_UNIT[component.unit as LengthUnit];
    if (resolutionMm === 0 || resolutionMm < Math.abs(valueMm) * Number.EPSILON * 2) {
      return { ok: false, code: 'invalid-value', message: 'Entered precision exceeds the supported numeric range' };
    }
  }
  const measurement: KnownMeasurement = {
    state: 'known', valueMm, provenance: {
      source: 'manual', input, unit, components, confirmation: { status: 'unconfirmed' },
    },
  };
  const schema = { dimension: dimensionSchema, elevation: elevationSchema, coordinate: coordinateMeasurementSchema }[parsedOptions.data.kind];
  if (!schema.safeParse(measurement).success) {
    return { ok: false, code: 'invalid-value', message: 'Dimensions must be positive; elevations cannot be negative' };
  }
  return { ok: true, measurement };
}

/** Display precision only. Never write this rounded string back as a measurement. */
export function formatMeasurement(valueMm: Mm, unit: LengthUnit, fractionDigits = 2): string {
  z.number().int().min(0).max(12).parse(fractionDigits);
  return `${fromMm(valueMm, unit).toFixed(fractionDigits)} ${unit}`;
}
