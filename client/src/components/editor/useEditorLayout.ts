import { useCallback, useEffect, useState } from 'react';
import {
  EDITOR_LAYOUT_STORAGE_KEY,
  clampLeftPanelWidth,
  cycleLeftMode,
  leftModeAnnouncement,
  parseEditorLayoutPreference,
  type EditorLayoutPreferenceV1,
  type EditorLeftMode,
} from './editorLayout';

function initialPreference(): EditorLayoutPreferenceV1 {
  if (typeof window === 'undefined') return parseEditorLayoutPreference(null, 1280);
  let stored: string | null = null;
  try { stored = window.localStorage.getItem(EDITOR_LAYOUT_STORAGE_KEY); } catch { /* Layout storage never blocks editing. */ }
  return parseEditorLayoutPreference(stored, window.innerWidth);
}

export function useEditorLayout() {
  const [preference, setPreference] = useState<EditorLayoutPreferenceV1>(initialPreference);
  const [isPhone, setIsPhone] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [inspectorPresentation, setInspectorPresentation] = useState<'desktop' | 'tablet' | 'phone'>(() => {
    if (typeof window === 'undefined') return 'desktop';
    if (window.innerWidth < 768) return 'phone';
    return window.innerWidth < 1280 ? 'tablet' : 'desktop';
  });
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    const phone = window.matchMedia('(max-width: 767px)');
    const tablet = window.matchMedia('(min-width: 768px) and (max-width: 1279px)');
    const update = () => {
      setIsPhone(phone.matches);
      setInspectorPresentation(phone.matches ? 'phone' : tablet.matches ? 'tablet' : 'desktop');
    };
    update();
    phone.addEventListener('change', update);
    tablet.addEventListener('change', update);
    return () => {
      phone.removeEventListener('change', update);
      tablet.removeEventListener('change', update);
    };
  }, []);

  const updatePreference = useCallback((update: (previous: EditorLayoutPreferenceV1) => EditorLayoutPreferenceV1) => {
    setPreference(previous => {
      const next = update(previous);
      try { window.localStorage.setItem(EDITOR_LAYOUT_STORAGE_KEY, JSON.stringify(next)); } catch { /* Layout storage never blocks editing. */ }
      return next;
    });
  }, []);

  const setLeftMode = useCallback((leftMode: EditorLeftMode) => {
    updatePreference(previous => ({ ...previous, leftMode }));
    setAnnouncement(leftModeAnnouncement(leftMode));
  }, [updatePreference]);

  const cycleTools = useCallback(() => setLeftMode(cycleLeftMode(preference.leftMode)), [preference.leftMode, setLeftMode]);

  const setLeftExpandedWidth = useCallback((leftExpandedWidth: number) => {
    updatePreference(previous => ({ ...previous, leftExpandedWidth: clampLeftPanelWidth(leftExpandedWidth) }));
  }, [updatePreference]);

  return {
    leftMode: preference.leftMode,
    leftExpandedWidth: preference.leftExpandedWidth,
    isPhone,
    inspectorPresentation,
    announcement,
    cycleTools,
    setLeftMode,
    setLeftExpandedWidth,
  };
}
