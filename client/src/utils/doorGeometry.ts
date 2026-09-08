import type { DoorProperties, Room, RoomObject, SwingDirection, SwingSide } from './types';

/**
 * Stored swingSide is the hinge side when facing the wall from inside the room.
 * It is kept unchanged for existing sketches. Displayed hand uses the owner's
 * back-to-hinge-jamb, facing-latch convention, which reverses it for an inswing.
 */
export function getDoorHand(storedSide: SwingSide, direction: SwingDirection): SwingSide {
  return direction === 'inward' ? oppositeSide(storedSide) : storedSide;
}

export function getStoredHinge(hand: SwingSide, direction: SwingDirection): SwingSide {
  return direction === 'inward' ? oppositeSide(hand) : hand;
}

function oppositeSide(side: SwingSide): SwingSide {
  return side === 'left' ? 'right' : 'left';
}

export function createDefaultDoorProperties(): DoorProperties {
  return { style: 'single', swingDirection: 'inward', swingSide: 'right', width: 36, height: 80 };
}

export interface DoorGeometry {
  bar: { x: number; y: number; width: number; height: number };
  origin: { x: number; y: number };
  transform: string;
  leafArcPath: string;
  sectorPath: string;
  /** Opening bar width in model pixels; legacy missing-properties doors use 40. */
  size: number;
  /** Swing radius in model pixels; legacy missing-properties doors use 60. */
  swingSize: number;
  doorProperties: DoorProperties;
}

/**
 * Shared preview, rendering and hit geometry for a door, without changing saved
 * data. Local u follows the wall clockwise; local v points into this room.
 * Keep the historical 20 pixels/foot conversion here to avoid a canvas cycle.
 */
export function getDoorGeometry(room: Pick<Room, 'width' | 'height'>, object: RoomObject): DoorGeometry {
  const doorProperties = object.doorProperties ? { ...object.doorProperties } : createDefaultDoorProperties();
  const swingSize = (doorProperties.width * 20) / 12;
  // Legacy drawings intentionally retain their old bar/arc size difference.
  const size = object.doorProperties ? swingSize : 40;
  const alongX = room.width * object.position / 100;
  const alongY = room.height * object.position / 100;
  let bar: DoorGeometry['bar'];
  let origin: DoorGeometry['origin'];
  let tx: number;
  let ty: number;

  switch (object.wallSide) {
    case 'top':
      bar = { x: alongX - size / 2, y: 0, width: size, height: 8 };
      origin = { x: alongX - swingSize / 2, y: 4 };
      tx = 1; ty = 0;
      break;
    case 'right':
      bar = { x: room.width - 8, y: alongY - size / 2, width: 8, height: size };
      origin = { x: room.width - 4, y: alongY - swingSize / 2 };
      tx = 0; ty = 1;
      break;
    case 'bottom':
      bar = { x: alongX - size / 2, y: room.height - 8, width: size, height: 8 };
      origin = { x: alongX + swingSize / 2, y: room.height - 4 };
      tx = -1; ty = 0;
      break;
    case 'left':
      bar = { x: 0, y: alongY - size / 2, width: 8, height: size };
      origin = { x: 4, y: alongY + swingSize / 2 };
      tx = 0; ty = -1;
      break;
  }

  const isInward = doorProperties.swingDirection === 'inward';
  const isRightHinge = doorProperties.swingSide === 'right';
  const hinge = isRightHinge ? swingSize : 0;
  const closedTip = isRightHinge ? 0 : swingSize;
  const openDepth = isInward ? swingSize : -swingSize;
  const sweep = isRightHinge === isInward ? 0 : 1;
  const arc = `A ${swingSize} ${swingSize} 0 0 ${sweep} ${hinge} ${openDepth}`;

  return {
    bar, origin,
    transform: `matrix(${tx} ${ty} ${-ty} ${tx} 0 0)`,
    leafArcPath: `M ${hinge} 0 L ${hinge} ${openDepth} M ${closedTip} 0 ${arc}`,
    // Close along the two radii: only the actual swept quarter-disc is hit area.
    sectorPath: `M ${hinge} 0 L ${closedTip} 0 ${arc} Z`,
    size, swingSize, doorProperties,
  };
}
