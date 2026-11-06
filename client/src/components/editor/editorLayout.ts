export type EditorLeftMode = 'expanded' | 'rail' | 'hidden';

export interface EditorLayoutPreferenceV1 {
  version: 1;
  leftMode: EditorLeftMode;
  leftExpandedWidth: number;
}

export const EDITOR_LAYOUT_STORAGE_KEY = 'mfp:editor-layout:v1';
export const DEFAULT_LEFT_PANEL_WIDTH = 260;
export const MIN_LEFT_PANEL_WIDTH = 240;
export const MAX_LEFT_PANEL_WIDTH = 360;

export function defaultLeftMode(viewportWidth: number): EditorLeftMode {
  if (viewportWidth < 768) return 'hidden';
  if (viewportWidth < 1280) return 'rail';
  return 'expanded';
}

export function cycleLeftMode(mode: EditorLeftMode): EditorLeftMode {
  if (mode === 'expanded') return 'rail';
  if (mode === 'rail') return 'hidden';
  return 'expanded';
}

export function clampLeftPanelWidth(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_LEFT_PANEL_WIDTH;
  return Math.min(MAX_LEFT_PANEL_WIDTH, Math.max(MIN_LEFT_PANEL_WIDTH, Math.round(value)));
}

export function parseEditorLayoutPreference(value: string | null, viewportWidth: number): EditorLayoutPreferenceV1 {
  const fallback: EditorLayoutPreferenceV1 = {
    version: 1,
    leftMode: defaultLeftMode(viewportWidth),
    leftExpandedWidth: DEFAULT_LEFT_PANEL_WIDTH,
  };
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value) as Partial<EditorLayoutPreferenceV1> | null;
    if (!parsed || parsed.version !== 1 || !['expanded', 'rail', 'hidden'].includes(parsed.leftMode ?? '')) return fallback;
    return {
      version: 1,
      leftMode: parsed.leftMode as EditorLeftMode,
      leftExpandedWidth: clampLeftPanelWidth(parsed.leftExpandedWidth ?? DEFAULT_LEFT_PANEL_WIDTH),
    };
  } catch {
    return fallback;
  }
}

export function leftModeAnnouncement(mode: EditorLeftMode): string {
  if (mode === 'expanded') return 'Tools expanded';
  if (mode === 'rail') return 'Tools collapsed to icons';
  return 'Tools hidden';
}
