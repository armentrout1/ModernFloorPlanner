import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LEFT_PANEL_WIDTH,
  MAX_LEFT_PANEL_WIDTH,
  MIN_LEFT_PANEL_WIDTH,
  clampLeftPanelWidth,
  cycleLeftMode,
  defaultLeftMode,
  leftModeAnnouncement,
  parseEditorLayoutPreference,
} from '../client/src/components/editor/editorLayout';

test('editor tool defaults follow the documented responsive bands', () => {
  assert.equal(defaultLeftMode(390), 'hidden');
  assert.equal(defaultLeftMode(767), 'hidden');
  assert.equal(defaultLeftMode(768), 'rail');
  assert.equal(defaultLeftMode(1279), 'rail');
  assert.equal(defaultLeftMode(1280), 'expanded');
  assert.equal(defaultLeftMode(1920), 'expanded');
});

test('editor tool state advances exactly one step with direct announcements', () => {
  assert.equal(cycleLeftMode('expanded'), 'rail');
  assert.equal(cycleLeftMode('rail'), 'hidden');
  assert.equal(cycleLeftMode('hidden'), 'expanded');
  assert.equal(leftModeAnnouncement('expanded'), 'Tools expanded');
  assert.equal(leftModeAnnouncement('rail'), 'Tools collapsed to icons');
  assert.equal(leftModeAnnouncement('hidden'), 'Tools hidden');
});

test('layout preference rejects malformed versions and clamps safe widths', () => {
  assert.deepEqual(parseEditorLayoutPreference(null, 820), {
    version: 1, leftMode: 'rail', leftExpandedWidth: DEFAULT_LEFT_PANEL_WIDTH,
  });
  assert.deepEqual(parseEditorLayoutPreference('{"version":2,"leftMode":"expanded"}', 390), {
    version: 1, leftMode: 'hidden', leftExpandedWidth: DEFAULT_LEFT_PANEL_WIDTH,
  });
  assert.deepEqual(parseEditorLayoutPreference('{bad json', 1440), {
    version: 1, leftMode: 'expanded', leftExpandedWidth: DEFAULT_LEFT_PANEL_WIDTH,
  });
  assert.equal(parseEditorLayoutPreference('{"version":1,"leftMode":"expanded","leftExpandedWidth":999}', 820).leftExpandedWidth,
    MAX_LEFT_PANEL_WIDTH);
  assert.equal(parseEditorLayoutPreference('{"version":1,"leftMode":"hidden","leftExpandedWidth":1}', 820).leftExpandedWidth,
    MIN_LEFT_PANEL_WIDTH);
  assert.equal(clampLeftPanelWidth(Number.NaN), DEFAULT_LEFT_PANEL_WIDTH);
});
