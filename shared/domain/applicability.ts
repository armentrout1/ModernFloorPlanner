import { z } from 'zod';

export const APPLICABILITY_VERSION = 'room-applicability-v1' as const;
export const APPLICABILITY_FIELDS = ['ceiling', 'walls', 'crownPath'] as const;
export type ApplicabilityField = typeof APPLICABILITY_FIELDS[number];
export const applicabilitySourceSchema = z.enum(['manual', 'imported', 'proposed']);
const confirmationSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('unconfirmed') }).strict(),
  z.object({ status: z.literal('confirmed'), confirmedAt: z.string().datetime({ offset: true }) }).strict(),
]);
function declaration<const T extends string>(supported: T) {
  return z.object({
    value: z.enum([supported, 'unknown', 'unsupported']),
    source: applicabilitySourceSchema, confirmation: confirmationSchema,
    detail: z.string().refine(value => value.trim().length > 0, 'Detail cannot be blank').optional(),
  }).strict().superRefine((value, context) => {
    if (value.value === 'unknown' || value.value === 'unsupported') {
      if (!value.detail) context.addIssue({ code: z.ZodIssueCode.custom, path: ['detail'], message: 'Unknown or unsupported conditions require their reason' });
      if (value.confirmation.status !== 'unconfirmed') context.addIssue({ code: z.ZodIssueCode.custom,
        path: ['confirmation'], message: 'An unknown or unsupported model cannot certify a supported calculation' });
    }
  });
}
export const roomApplicabilitySchema = z.object({
  ceiling: declaration('flat'), walls: declaration('vertical-uniform'), crownPath: declaration('rectangular-horizontal'),
}).strict();
export type RoomApplicability = z.infer<typeof roomApplicabilitySchema>;
export type AppDeclaration = RoomApplicability[ApplicabilityField];
// Preserve valid own room IDs such as __proto__; Zod's generic record parser
// normalizes that key away. Validate each profile without rewriting the ID map.
const profilesSchema = z.custom<Record<string, RoomApplicability>>().superRefine((input, context) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
    context.addIssue({ code: z.ZodIssueCode.custom, fatal: true, message: 'Expected a room ID to applicability map' });
    return;
  }
  for (const [id, profile] of Object.entries(input)) {
    const parsed = roomApplicabilitySchema.safeParse(profile);
    if (!parsed.success) for (const issue of parsed.error.issues) context.addIssue({
      ...issue, path: [id, ...issue.path],
    });
  }
});
export const calculationContractSchema = z.object({
  version: z.literal(APPLICABILITY_VERSION), rooms: profilesSchema,
}).strict();

/** Historical shapes are not inferred from their rectangular plan projection. */
export function createUnknownRoomApplicability(detail = 'The source does not establish this finish model.',
  source: z.infer<typeof applicabilitySourceSchema> = 'imported'): RoomApplicability {
  const unknown = () => ({ value: 'unknown' as const, source, confirmation: { status: 'unconfirmed' as const }, detail });
  return { ceiling: unknown(), walls: unknown(), crownPath: unknown() };
}

/** A proposed rectangular room is usable provisionally, never measured by default. */
export function createProposedRoomApplicability(): RoomApplicability {
  const proposed = { source: 'proposed' as const, confirmation: { status: 'unconfirmed' as const } };
  return { ceiling: { ...proposed, confirmation: { ...proposed.confirmation }, value: 'flat' },
    walls: { ...proposed, confirmation: { ...proposed.confirmation }, value: 'vertical-uniform' },
    crownPath: { ...proposed, confirmation: { ...proposed.confirmation }, value: 'rectangular-horizontal' } };
}
