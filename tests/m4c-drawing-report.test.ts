import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { renderPlanDrawing, PLAN_DRAWING_CSS } from '../shared/exports/planDrawing';
import { createQuantitySnapshot, type QuantitySnapshot } from '../shared/quantities/snapshot';
import { canonicalJson } from '../shared/quantities/canonicalJson';
import { unknownMeasurement } from '../shared/domain/measurements';
import type { PhysicalDocument, WallSide } from '../shared/domain/document';
import { createBuildingLevel } from '../shared/domain/levels';
import { createStairAssembly, createSurfaceOpening } from '../shared/domain/stairs';
import { createFunctionalZone, createCabinetBlock } from '../shared/domain/layout';
import { upgradePhysicalDocumentToLevels } from '../shared/compatibility/levels';
import { upgradePhysicalDocumentToStairs } from '../shared/compatibility/stairs';
import { upgradePhysicalDocumentToLayout } from '../shared/compatibility/layout';
import { getDoorGeometry } from '../client/src/utils/doorGeometry';
import { q001, room, measured, request, AT, freezeDeep } from './fixtures/physical';
const options = { unit: 'ft' as const };
async function capture(document: PhysicalDocument = q001()) {
  const selected = request([]);
  if (document.quantityPolicyVersion) selected.policy.version = document.quantityPolicyVersion as typeof selected.policy.version;
  const result = await createQuantitySnapshot(document, selected, { id: 'drawing-capture', createdAt: AT, kind: 'evaluation' });
  assert.ok(result.ok, JSON.stringify(result)); return result.snapshot;
}
const fixture = (name: string): QuantitySnapshot => JSON.parse(readFileSync(new URL('./fixtures/' + name, import.meta.url), 'utf8'));
const section = (html: string, level: string) => html.split(`data-level-id="${level}"`)[1].split('</section>')[0];
const numericPath = (path: string) => (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

test('captured rectangular layout has actual room and window geometry, room dimensions and source identity', async () => {
  const html = renderPlanDrawing(await capture(), options);
  assert.match(html, /data-kind="room" data-entity-id="room-1"/);
  assert.match(html, /<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="[\d.]+"/);
  assert.match(html, /12 × 10 ft/); assert.match(html, /Length 12 ft \(confirmed\); width 10 ft \(confirmed\)/);
  assert.match(html, /data-kind="window" data-entity-id="window"/);
  assert.match(html, /drawing-capture/); assert.match(html, /2026-09-06T12:00:00.000Z/);
  assert.match(html, /Entire captured layout is shown, independently of the selected quantity scope/);
  assert.match(html, /not a certified scale drawing/);
  assert.match(html, /Swing\/style not captured; gap only/);
  assert.doesNotMatch(html, /data-door-outline/);
});
for (const side of ['top', 'right', 'bottom', 'left'] as const) for (const hinge of ['left', 'right'] as const) for (const direction of ['inward', 'outward'] as const) {
  test(`door ${side} ${hinge} ${direction} preserves editor clockwise handing and swing path`, async () => {
    const document = q001(), opening = document.openings[0]; document.openings = [opening];
    opening.appearance = { style: 'single', swingSide: hinge, swingDirection: direction, metadata: {} };
    const span = side === 'top' || side === 'bottom' ? 3657.6 : 3048;
    opening.attachments[0] = { wallFaceId: 'room-1:' + side, anchor: 'center', offsetMm: span / 2 as never };
    const html = renderPlanDrawing(await capture(document), options);
    const path = html.match(/data-door-outline="true" d="([^"]+)"/)![1];
    const local = getDoorGeometry({ width: 240, height: 200 }, { id: 'door', type: 'door', wallSide: side, position: 50, size: 60,
      doorProperties: { style: 'single', swingSide: hinge, swingDirection: direction, width: 36, height: 84 } });
    const actual = numericPath(path), expected = numericPath(local.leafArcPath);
    // Arc flags are fixed; all physical path coordinates/radii scale by one factor.
    const scale = actual[6] / expected[6];
    assert.ok(scale > 0);
    expected.forEach((n, index) => assert.ok(Math.abs(actual[index] - n * ([8, 9, 10].includes(index) ? 1 : scale)) < 1e-4, `path index ${index}`));
    assert.ok(html.includes(local.transform));
    assert.match(html, new RegExp(`data-door-hinge="${hinge}" data-door-direction="${direction}" data-door-style="single"`));
  });
}
for (const side of ['top', 'right', 'bottom', 'left'] as const) test(`asymmetric ${side} opening center uses captured clockwise wall offset`, async () => {
  const document = q001(), opening = document.openings[0]; document.openings = [opening];
  opening.attachments[0].wallFaceId = 'room-1:' + side;
  const html = renderPlanDrawing(await capture(document), options);
  const bounds = html.match(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/)!.slice(1).map(Number);
  const origin = html.match(/transform="translate\(([\d.]+) ([\d.]+)\)/)!.slice(1).map(Number);
  const scale = bounds[2] / 3657.6, center = 762 * scale, half = 914.4 * scale / 2;
  const expected = side === 'top' ? [bounds[0] + center - half, bounds[1]]
    : side === 'right' ? [bounds[0] + bounds[2], bounds[1] + center - half]
      : side === 'bottom' ? [bounds[0] + bounds[2] - center + half, bounds[1] + bounds[3]]
        : [bounds[0], bounds[1] + bounds[3] - center + half];
  assert.ok(Math.abs(origin[0] - expected[0]) < 1e-4); assert.ok(Math.abs(origin[1] - expected[1]) < 1e-4);
});
test('sliding doors keep captured style without adding a hinged swing', async () => {
  const document = q001(); document.openings[0].appearance = { style: 'sliding', swingDirection: 'outward', swingSide: 'right', metadata: {} };
  const html = renderPlanDrawing(await capture(document), options);
  assert.match(html, /data-door-style="sliding"/); assert.doesNotMatch(html, /data-door-outline/);
  assert.match(html, /Style: sliding/);
});
test('shared door has a gap on each attachment but only one primary swing', async () => {
  const document = q001(); document.rooms.push(room('second')); document.openings = [document.openings[0]];
  document.openings[0].appearance = { style: 'single', swingDirection: 'inward', swingSide: 'left', metadata: {} };
  document.openings[0].attachments.push({ wallFaceId: 'second:bottom', anchor: 'center', offsetMm: 762 as never });
  const html = renderPlanDrawing(await capture(document), options);
  assert.equal((html.match(/data-kind="door"/g) ?? []).length, 2);
  assert.equal((html.match(/data-door-outline/g) ?? []).length, 1);
  assert.match(html, /secondary faces show the same opening gap/);
});
test('overlapping coordinates on different levels remain isolated; display order and empty levels are explicit', async () => {
  const base = q001(); base.rooms.push(room('upstairs'));
  const document = upgradePhysicalDocumentToLevels(base, 'ground');
  document.buildingLevels.levels[0].name = 'Ground floor'; document.buildingLevels.levels[0].ownership = 'assigned';
  document.buildingLevels.levels.push(createBuildingLevel('upper', 'Upper floor', 1), createBuildingLevel('empty', 'Empty level', 2));
  document.buildingLevels.roomLevels.upstairs = 'upper';
  const snapshot = await capture(document), before = canonicalJson(snapshot), html = renderPlanDrawing(snapshot, options);
  assert.match(section(html, 'ground'), /data-entity-id="room-1"/); assert.doesNotMatch(section(html, 'ground'), /data-entity-id="upstairs"/);
  assert.match(section(html, 'upper'), /data-entity-id="upstairs"/); assert.doesNotMatch(section(html, 'upper'), /data-entity-id="room-1"/);
  assert.match(section(html, 'empty'), /No rooms captured on this level/);
  assert.ok(html.indexOf('data-level-id="ground"') < html.indexOf('data-level-id="upper"'));
  assert.equal(canonicalJson(snapshot), before);
});
test('schema5 renders captured stairs, endpoint landings, surface openings, zones and cabinet blocks using room-local bounds', async () => {
  const document = upgradePhysicalDocumentToLayout(upgradePhysicalDocumentToStairs(upgradePhysicalDocumentToLevels(q001(), 'main')));
  const placement = { anchor: 'room-local-top-left' as const, x: measured('1 ft'), y: measured('1 ft'), rotation: 90 as const };
  const stair = createStairAssembly('stair', 'Connection'); stair.run = measured('6 ft'); stair.width = measured('3 ft');
  stair.endpoints.lower = { state: 'modeled', levelId: 'main', roomId: 'room-1', placement };
  stair.landings.lower = { id: 'landing', width: measured('3 ft'), depth: measured('2 ft'), placement };
  document.stairsContract.stairs.push(stair);
  const voidItem = createSurfaceOpening('void', 'room-1', 'ceiling'); voidItem.width = measured('2 ft'); voidItem.length = measured('3 ft'); voidItem.attachments[0].placement = placement;
  document.stairsContract.surfaceOpenings.push(voidItem);
  const zone = createFunctionalZone('zone', 'room-1'); zone.width = measured('3 ft'); zone.length = measured('5 ft'); zone.placement = placement;
  const cabinet = createCabinetBlock('cabinet', 'room-1'); cabinet.length = measured('3 ft'); cabinet.depth = measured('2 ft'); cabinet.placement = placement;
  document.layoutContract.zones.push(zone); document.layoutContract.cabinetBlocks.push(cabinet);
  const snapshot = await capture(document), before = canonicalJson(snapshot), html = renderPlanDrawing(snapshot, options);
  for (const [kind, id] of [['stair', 'stair'], ['landing', 'landing'], ['surface-opening', 'void'], ['zone', 'zone'], ['fixed-object', 'cabinet']])
    assert.match(html, new RegExp(`data-kind="${kind}" data-entity-id="${id}"[^>]*><title>[^<]+</title><rect`));
  for (const [kind, expectedRatio] of [['stair', .5], ['landing', 2 / 3], ['surface-opening', 1.5], ['zone', 5 / 3], ['fixed-object', 2 / 3]] as const) {
    const group = html.split(`data-kind="${kind}"`)[1], match = group.match(/<rect[^>]+width="([\d.]+)" height="([\d.]+)"/)!;
    assert.ok(Math.abs(Number(match[1]) / Number(match[2]) - expectedRatio) < 1e-4, kind + ' rotated footprint');
  }
  assert.match(html, /Unplaced building connections/); assert.match(html, /Not drawn: destination unresolved/);
  assert.match(html, /Surface: ceiling/); assert.match(html, /not additional room finish area/);
  assert.match(html, /Arrow indicates captured run direction; no tread count is inferred/);
  assert.equal(canonicalJson(snapshot), before);
});
test('unsupported surface geometry stays in its schedule without a fabricated rectangle', async () => {
  const document = upgradePhysicalDocumentToStairs(upgradePhysicalDocumentToLevels(q001(), 'main'));
  const opening = createSurfaceOpening('unsupported-void', 'room-1', 'floor'); opening.geometry = 'unsupported'; opening.detail = 'L-shaped opening';
  opening.width = measured('2 ft'); opening.length = measured('3 ft');
  opening.attachments[0].placement = { anchor: 'room-local-top-left', x: measured('1 ft'), y: measured('1 ft'), rotation: 0 };
  document.stairsContract.surfaceOpenings.push(opening);
  const html = renderPlanDrawing(await capture(document), options);
  assert.doesNotMatch(html, /data-kind="surface-opening"/); assert.match(html, /L-shaped opening/); assert.match(html, /Not drawn: unsupported captured geometry/);
});
test('unknown dimensions and absent placements are reported without positions or zero-sized placeholders', async () => {
  const document = q001(); delete document.rooms[0].presentation;
  document.rooms.push(room('unresolved')); document.rooms[1].length = unknownMeasurement('Length not measured');
  const html = renderPlanDrawing(await capture(document), options);
  assert.doesNotMatch(html, /data-kind="room"/); assert.doesNotMatch(html, /<svg/);
  assert.match(html, /layout position not captured; no position has been invented/);
  assert.match(html, /plan length or width is unresolved/); assert.match(html, /Length not measured/);
  assert.doesNotMatch(html, /NaN|Infinity/);
});
test('invalid opening fit is not silently clamped onto its room wall', async () => {
  const document = q001(); document.openings[0].attachments[0].offsetMm = 0 as never;
  const html = renderPlanDrawing(await capture(document), options);
  assert.doesNotMatch(html, /data-kind="door"/); assert.match(html, /Not drawn: opening does not fit its captured wall/);
});
test('large translated coordinates retain readable normalized geometry while lost numeric extents are explicit', async () => {
  const document = q001(); document.openings = [];
  document.rooms[0].presentation = { xMm: 1e9 as never, yMm: -1e9 as never };
  const html = renderPlanDrawing(await capture(document), options);
  assert.match(html, /data-kind="room"/); assert.doesNotMatch(html, /NaN|Infinity/);
  const rect = html.match(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/)!.slice(1).map(Number);
  assert.ok(rect.every(n => n >= 0 && n <= 760)); assert.ok(Math.abs(rect[2] / rect[3] - 1.2) < 1e-5);
  document.rooms[0].presentation.xMm = Number.MAX_SAFE_INTEGER as never;
  const unavailable = renderPlanDrawing(await capture(document), options);
  assert.doesNotMatch(unavailable, /data-kind="room"/); assert.match(unavailable, /coordinates cannot preserve the measured extent/);
});
for (const name of ['m3b-v1-snapshot.json', 'm3d-v2-snapshot.json', 'm3d-v3-snapshot.json', 'm3d-v4-snapshot.json']) test('historical drawing is deterministic and leaves complete frozen capture unchanged: ' + name, () => {
  const snapshot = freezeDeep(fixture(name)), before = canonicalJson(snapshot);
  const first = renderPlanDrawing(snapshot, options); assert.equal(renderPlanDrawing(snapshot, options), first);
  assert.equal(canonicalJson(snapshot), before);
  assert.ok(first.includes('source schema ' + snapshot.sourceDocument.schemaVersion));
  if (snapshot.sourceDocument.schemaVersion === 2) {
    assert.match(first, /data-layout="historical"/); assert.match(first, /Level ownership was not captured/); assert.doesNotMatch(first, /data-level-id=/);
  }
});
test('untrusted names and IDs are escaped in HTML and SVG and cannot inject CSS, scripts or network requests', async () => {
  const document = q001(); document.rooms[0].name = '<svg onload="alert(1)"><script>x</script>';
  document.rooms[0].presentation!.color = 'url(https://example.invalid)';
  document.openings[0].id = 'door"><image href="https://example.invalid"/>';
  const html = renderPlanDrawing(await capture(document), options);
  assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/); assert.match(html, /data-entity-id="door&quot;&gt;&lt;image href=&quot;/);
  assert.doesNotMatch(html, /<script|<image|<foreignObject|<iframe|<[^>]+\sonload="|url\(/i);
  assert.doesNotMatch(html, /\shref="|<style|style="/i);
});
test('metric drawing dimensions do not change geometry, and print CSS keeps each level separate with paginating schedules', async () => {
  const snapshot = await capture(), ft = renderPlanDrawing(snapshot, options), metric = renderPlanDrawing(snapshot, { unit: 'm' });
  assert.match(metric, /3.66 × 3.05 m/); assert.match(metric, /Length 3.6576 m \(confirmed\)/);
  assert.equal(ft.match(/<rect[^>]+>/)![0], metric.match(/<rect[^>]+>/)![0]);
  assert.match(PLAN_DRAWING_CSS, /break-before:page/); assert.match(PLAN_DRAWING_CSS, /display:table-header-group/);
  assert.match(PLAN_DRAWING_CSS, /overflow-wrap:anywhere/); assert.match(PLAN_DRAWING_CSS, /max-height:130mm/);
  assert.throws(() => renderPlanDrawing(snapshot, { unit: 'px' as never }), /Explicit drawing units/);
});
