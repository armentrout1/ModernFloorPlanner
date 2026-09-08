/**
 * CRITICAL: DOORS & WINDOWS FUNCTIONALITY
 * 
 * This file contains core doors/windows logic. Before making ANY changes:
 * 1. Read DOORS_AND_WINDOWS.md thoroughly
 * 2. Test all door/window placement scenarios after changes
 * 3. Verify drag-and-drop behavior still works
 * 4. Check property panel updates correctly
 * 
 * Last verified: June 1, 2025
 */

import { Square } from "lucide-react";
import { Room, RoomObject as RoomObjectType, WallSide, DoorStyle, SwingDirection, SwingSide } from "@shared/schema";
import { inchesToPixels } from "@/utils/canvas";

interface RoomObjectProps {
  room: Room;
  object: RoomObjectType;
  scale: number;
  isSelected: boolean;
  onSelect: (objectId: string) => void;
  onDragStart?: (objectId: string, clientX: number, clientY: number) => void;
}

const RoomObject = ({ room, object, scale, isSelected, onSelect, onDragStart }: RoomObjectProps) => {
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.focus({ preventScroll: true });
    onSelect(object.id);
    if (onDragStart) {
      onDragStart(object.id, e.clientX, e.clientY);
    }
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    e.stopPropagation();
    e.currentTarget.focus({ preventScroll: true });
    onSelect(object.id);
    if (onDragStart && e.touches[0]) {
      onDragStart(object.id, e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.cancelable) e.preventDefault();
    // Bubble release/cancel to the canvas owner; touch stays targeted at its origin.
  };

  const horizontal = object.wallSide === 'top' || object.wallSide === 'bottom';
  // A narrow screen-sized strip around the existing wall bar, not the swing arc.
  // Preserve the bar's model dimensions/test bounds and avoid widening along the wall.
  const hitThickness = Math.max(8, 18 / Math.max(scale, 0.05));
  const hitArea = <span aria-hidden="true" style={{ position: 'absolute', display: 'block',
    left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
    width: horizontal ? '100%' : hitThickness, height: horizontal ? hitThickness : '100%',
    background: 'transparent', cursor: 'pointer' }} />;
  const handleSelectionKey = (event: React.KeyboardEvent) => {
    if ((event.key === 'Enter' || event.key === ' ') && !event.nativeEvent.isComposing) {
      event.preventDefault(); event.stopPropagation(); onSelect(object.id);
    }
  };

  // Render door with swing arc
  if (object.type === 'door') {
    const doorProps = object.doorProperties || {
      style: 'single' as DoorStyle,
      swingDirection: 'inward' as SwingDirection,
      swingSide: 'right' as SwingSide,
      width: 36,
      height: 80
    };

    const doorSize = inchesToPixels(doorProps.width);
    const isInward = doorProps.swingDirection === 'inward';
    const isRightSwing = doorProps.swingSide === 'right';
    // Local u follows the wall clockwise; local v points into this room.
    // Left/right is viewed facing the wall from inside, consistently on all walls.
    const wallStart = object.wallSide === 'top'
      ? { x: room.width * object.position / 100 - doorSize / 2, y: 4, tx: 1, ty: 0 }
      : object.wallSide === 'right'
        ? { x: room.width - 4, y: room.height * object.position / 100 - doorSize / 2, tx: 0, ty: 1 }
        : object.wallSide === 'bottom'
          ? { x: room.width * object.position / 100 + doorSize / 2, y: room.height - 4, tx: -1, ty: 0 }
          : { x: 4, y: room.height * object.position / 100 + doorSize / 2, tx: 0, ty: -1 };
    const hinge = isRightSwing ? doorSize : 0;
    const closedTip = isRightSwing ? 0 : doorSize;
    const openDepth = isInward ? doorSize : -doorSize;
    const sweep = isRightSwing === isInward ? 0 : 1;

    return (
      <div style={{ position: 'absolute' }}>
        {/* Door opening line */}
        <div
          style={{
            position: 'absolute',
            backgroundColor: '#FF6B35',
            opacity: 1,
            zIndex: 1000,
            border: isSelected ? '3px solid #3B82F6' : '2px solid #000000',
            boxShadow: '0 0 4px rgba(0,0,0,0.5)',
            ...((() => {
              const size = object.doorProperties ? inchesToPixels(object.doorProperties.width) : 40;
              const styles: React.CSSProperties = {};
              
              switch (object.wallSide) {
                case 'top':
                  styles.left = `${(room.width * object.position / 100) - size / 2}px`;
                  styles.top = '0px';
                  styles.width = `${size}px`;
                  styles.height = '8px';
                  break;
                case 'right':
                  styles.left = `${room.width - 8}px`;
                  styles.top = `${(room.height * object.position / 100) - size / 2}px`;
                  styles.width = '8px';
                  styles.height = `${size}px`;
                  break;
                case 'bottom':
                  styles.left = `${(room.width * object.position / 100) - size / 2}px`;
                  styles.top = `${room.height - 8}px`;
                  styles.width = `${size}px`;
                  styles.height = '8px';
                  break;
                case 'left':
                  styles.left = '0px';
                  styles.top = `${(room.height * object.position / 100) - size / 2}px`;
                  styles.width = '8px';
                  styles.height = `${size}px`;
                  break;
              }
              
              return styles;
            })())
          }}
          data-testid={`opening-${object.id}`}
          role="button" tabIndex={0} aria-label={`Select ${object.type} on ${object.wallSide} wall`}
          aria-pressed={isSelected} onKeyDown={handleSelectionKey}
          data-opening-type={object.type}
          data-wall-side={object.wallSide}
          onClick={event => event.stopPropagation()}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >{hitArea}</div>
        
        {/* Swing is view-only: stored style, center, attachment and size stay unchanged. */}
        {doorProps.style !== 'sliding' && (
          <svg data-testid={`door-swing-${object.id}`} data-door-hinge={doorProps.swingSide}
            data-door-direction={doorProps.swingDirection} data-door-style={doorProps.style}
            aria-hidden="true" style={{ position: 'absolute', left: wallStart.x, top: wallStart.y,
              width: doorSize, height: doorSize, overflow: 'visible', pointerEvents: 'none', zIndex: 15, opacity: 0.8 }}>
            <g transform={`matrix(${wallStart.tx} ${wallStart.ty} ${-wallStart.ty} ${wallStart.tx} 0 0)`}>
              <path d={`M ${hinge} 0 L ${hinge} ${openDepth} M ${closedTip} 0 A ${doorSize} ${doorSize} 0 0 ${sweep} ${hinge} ${openDepth}`}
                fill="none" stroke="#FF6B35" strokeWidth="1.5" strokeDasharray="4,2" />
            </g>
          </svg>
        )}
      </div>
    );
  }

  // Render window - Real architectural style
  if (object.type === 'window') {
    const windowSize = object.size; // Use actual window size from properties

    return (
      <div style={{ position: 'absolute' }}>
        {/* Window opening - simple line break in wall */}
        <div
          style={{
            position: 'absolute',
            backgroundColor: '#FFFFFF', // White to show wall break
            border: isSelected ? '2px solid #3B82F6' : 'none',
            zIndex: 1000,
            ...((() => {
              const styles: React.CSSProperties = {};
              
              switch (object.wallSide) {
                case 'top':
                  styles.left = `${(room.width * object.position / 100) - windowSize / 2}px`;
                  styles.top = '0px';
                  styles.width = `${windowSize}px`;
                  styles.height = '8px';
                  break;
                case 'right':
                  styles.left = `${room.width - 8}px`;
                  styles.top = `${(room.height * object.position / 100) - windowSize / 2}px`;
                  styles.width = '8px';
                  styles.height = `${windowSize}px`;
                  break;
                case 'bottom':
                  styles.left = `${(room.width * object.position / 100) - windowSize / 2}px`;
                  styles.top = `${room.height - 8}px`;
                  styles.width = `${windowSize}px`;
                  styles.height = '8px';
                  break;
                case 'left':
                  styles.left = '0px';
                  styles.top = `${(room.height * object.position / 100) - windowSize / 2}px`;
                  styles.width = '8px';
                  styles.height = `${windowSize}px`;
                  break;
              }
              
              return styles;
            })())
          }}
          data-testid={`opening-${object.id}`}
          role="button" tabIndex={0} aria-label={`Select ${object.type} on ${object.wallSide} wall`}
          aria-pressed={isSelected} onKeyDown={handleSelectionKey}
          data-opening-type={object.type}
          data-wall-side={object.wallSide}
          onClick={event => event.stopPropagation()}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >{hitArea}</div>
        
        {/* Window frame lines - simple parallel lines */}
        <svg
          style={{
            position: 'absolute',
            pointerEvents: 'none',
            zIndex: 15,
            ...((() => {
              const svgStyle: React.CSSProperties = {};
              
              switch (object.wallSide) {
                case 'top':
                  svgStyle.left = `${(room.width * object.position / 100) - windowSize / 2}px`;
                  svgStyle.top = `4px`;
                  svgStyle.width = `${windowSize}px`;
                  svgStyle.height = `12px`;
                  break;
                case 'right':
                  svgStyle.left = `${room.width - 12}px`;
                  svgStyle.top = `${(room.height * object.position / 100) - windowSize / 2}px`;
                  svgStyle.width = `12px`;
                  svgStyle.height = `${windowSize}px`;
                  break;
                case 'bottom':
                  svgStyle.left = `${(room.width * object.position / 100) - windowSize / 2}px`;
                  svgStyle.top = `${room.height - 12}px`;
                  svgStyle.width = `${windowSize}px`;
                  svgStyle.height = `12px`;
                  break;
                case 'left':
                  svgStyle.left = `4px`;
                  svgStyle.top = `${(room.height * object.position / 100) - windowSize / 2}px`;
                  svgStyle.width = `12px`;
                  svgStyle.height = `${windowSize}px`;
                  break;
              }
              
              return svgStyle;
            })())
          }}
        >
          {/* Simple parallel lines like real architectural drawings */}
          {object.wallSide === 'top' || object.wallSide === 'bottom' ? (
            <>
              <line x1="0" y1="2" x2={windowSize} y2="2" stroke="#000" strokeWidth="1" />
              <line x1="0" y1="6" x2={windowSize} y2="6" stroke="#000" strokeWidth="1" />
            </>
          ) : (
            <>
              <line x1="2" y1="0" x2="2" y2={windowSize} stroke="#000" strokeWidth="1" />
              <line x1="6" y1="0" x2="6" y2={windowSize} stroke="#000" strokeWidth="1" />
            </>
          )}
        </svg>
      </div>
    );
  }

  return null;
};

export default RoomObject;