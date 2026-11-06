import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EDITOR_COMMANDS,
  PRIMARY_EDITOR_TOOLS,
  getEditorCommand,
  getEditorCommandAvailability,
  getEditorCommandLabel,
  type EditorCommandContext,
} from '../client/src/features/editor-tools/registry';

const emptyContext: EditorCommandContext = {
  roomCount: 0,
  selectionCount: 0,
  hasGroupedRooms: false,
  selectedRoomIsGrouped: false,
  showRoomNames: true,
  focusMode: false,
};

test('editor registry owns unique command metadata and only exposes guarded safe commands', () => {
  assert.equal(EDITOR_COMMANDS.length, 13);
  assert.equal(new Set(EDITOR_COMMANDS.map(command => command.id)).size, EDITOR_COMMANDS.length);
  assert.deepEqual(PRIMARY_EDITOR_TOOLS.map(command => command.id), ['move', 'room', 'door', 'window']);
  for (const command of EDITOR_COMMANDS) {
    assert.ok(command.label);
    assert.ok(command.help);
    assert.ok(command.aliases.length > 0);
    assert.equal(command.risk, 'safe');
    assert.ok(['tool-rail', 'tool-panel', 'canvas-navigation'].includes(command.primaryHome));
  }
  assert.equal(EDITOR_COMMANDS.some(command => command.id.includes('delete')), false);
});

test('registry availability explains prerequisites instead of hiding commands', () => {
  assert.deepEqual(getEditorCommandAvailability(getEditorCommand('select-all'), emptyContext), {
    available: false, reason: 'Draw a room first.',
  });
  assert.deepEqual(getEditorCommandAvailability(getEditorCommand('auto-align'), emptyContext), {
    available: false, reason: 'Add at least two rooms.',
  });
  assert.deepEqual(getEditorCommandAvailability(getEditorCommand('distribute-horizontal'), {
    ...emptyContext, roomCount: 3, hasGroupedRooms: true,
  }), { available: false, reason: 'Ungroup rooms before distributing them.' });
  assert.deepEqual(getEditorCommandAvailability(getEditorCommand('mirror-horizontal'), {
    ...emptyContext, roomCount: 1, selectionCount: 1,
  }), { available: true });
  assert.deepEqual(getEditorCommandAvailability(getEditorCommand('mirror-horizontal'), {
    ...emptyContext, roomCount: 1, selectionCount: 1, selectedRoomIsGrouped: true,
  }), { available: false, reason: 'Ungroup the room before transforming it.' });
});

test('registry provides tested beginner aliases and dynamic view labels', () => {
  assert.ok(getEditorCommand('move').aliases.includes('pointer'));
  assert.ok(getEditorCommand('door').aliases.includes('opening'));
  assert.ok(getEditorCommand('mirror-horizontal').aliases.includes('flip'));
  assert.ok(getEditorCommand('distribute-horizontal').aliases.includes('space evenly'));
  const visibility = getEditorCommand('toggle-room-names');
  assert.equal(getEditorCommandLabel(visibility, emptyContext), 'Hide room names');
  assert.equal(getEditorCommandLabel(visibility, { ...emptyContext, showRoomNames: false }), 'Show room names');
  const focus = getEditorCommand('focus-mode');
  assert.equal(focus.primaryHome, 'canvas-navigation');
  assert.ok(focus.aliases.includes('canvas only'));
  assert.equal(getEditorCommandLabel(focus, emptyContext), 'Enter focus mode');
  assert.equal(getEditorCommandLabel(focus, { ...emptyContext, focusMode: true }), 'Exit focus mode');
});
