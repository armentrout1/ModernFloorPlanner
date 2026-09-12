import { capturePhysicalSaveEnvelope } from '@shared/persistence/physicalSave';
import { createQuantitySnapshot } from '@shared/quantities/snapshot';
import type { PhysicalDraft } from './state';
import { pendingSaveFields } from './pendingSaveFields';
import { assertRequestContext, captureRequestContext, contextFetch } from '../account/runtime';

/** Capture committed values only, without applying raw text or changing evidence. */
export async function captureLocalReport(draft: PhysicalDraft, id: string, at: string) {
  if (pendingSaveFields(draft).length) throw Error('Apply or Revert unfinished fields before preparing a report. Your text is unchanged.');
  const envelope = capturePhysicalSaveEnvelope(draft);
  const result = await createQuantitySnapshot(envelope.document, envelope.request,
    { id, createdAt: at, kind: 'evaluation' }, envelope.evidence.events);
  if (!result.ok) throw Error('The report could not be captured: ' + result.errors.map(error => error.message).join(' '));
  return result.snapshot;
}

export async function fetchSavedReport(planId: string, revisionId: string, format: 'csv' | 'html' | 'plan', unit: 'ft' | 'm') {
  const context = await captureRequestContext();
  const url = `/api/physical-plans/${encodeURIComponent(planId)}/revisions/${encodeURIComponent(revisionId)}/export?format=${format}&unit=${unit}`;
  const response = await contextFetch('GET', url, undefined, context);
  if (!response.ok) throw Error('This saved report is unavailable or access changed. Your local draft is unchanged.');
  const text = await response.text();
  // contextFetch guards JSON consumption; report text needs the same final guard.
  assertRequestContext(context);
  return { text, context };
}
