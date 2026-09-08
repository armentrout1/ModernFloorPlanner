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

import { useRef } from "react";
import { getDoorGeometry } from "@/utils/doorGeometry";
import { Room, RoomObject as RoomObjectType } from "@shared/schema";

interface RoomObjectProps {
  room: Room;
  object: RoomObjectType;
  scale: number;
  isSelected: boolean;
  onSelect: (objectId: string) => void;
  preview?: boolean;
  /** Render an explicit physical floor-level gap, with no window frame or door. */
  floorLevelOpening?: boolean;
  onFlipHand?: (objectId: string) => void;
  onDragStart?: (objectId: string, clientX: number, clientY: number) => void;
}

const RoomObject = ({ room, object, scale, isSelected, onSelect, onDragStart, onFlipHand, preview = false, floorLevelOpening = false }: RoomObjectProps) => {
  const openingRef = useRef<HTMLDivElement>(null);
  const selectOpening = () => {
    openingRef.current?.focus({ preventScroll: true });
    onSelect(object.id);
  };
  const handleFlip = (event: React.MouseEvent) => {
    event.preventDefault(); event.stopPropagation();
    if (!preview && object.type === 'door' && object.doorProperties && object.doorProperties.style !== 'sliding') {
      selectOpening(); onFlipHand?.(object.id);
    }
  };
  const handleSwingPress = (event: React.MouseEvent) => {
    if (event.button !== 0 || preview) return;
    event.preventDefault(); event.stopPropagation(); selectOpening();
  };
  const handleSwingTouch = (event: React.TouchEvent) => {
    if (event.touches.length !== 1 || preview) return;
    event.stopPropagation(); selectOpening();
  };
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    selectOpening();
    if (onDragStart) {
      onDragStart(object.id, e.clientX, e.clientY);
    }
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    e.stopPropagation();
    selectOpening();
    if (onDragStart && e.touches[0]) {
      onDragStart(object.id, e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.cancelable) e.preventDefault();
    // Bubble release/cancel to the canvas owner; touch stays targeted at its origin.
  };

  const horizontal = object.wallSide === 'top' || object.wallSide === 'bottom';
  // The wall bar keeps a narrow screen-sized drag target; the swing selects separately.
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
    const { doorProperties: doorProps, bar, origin, transform, swingSize, leafArcPath, sectorPath } = getDoorGeometry(room, object);

    return (
      <div aria-hidden={preview || undefined} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: preview ? 'none' : undefined }}>
        {/* Door opening line */}
        <div
          style={{
            position: 'absolute',
            backgroundColor: '#FF6B35',
            opacity: 1,
            zIndex: 1000,
            border: isSelected ? '3px solid #3B82F6' : '2px solid #000000',
            boxShadow: '0 0 4px rgba(0,0,0,0.5)',
            left: bar.x, top: bar.y, width: bar.width, height: bar.height,
            pointerEvents: preview ? 'none' : 'auto',
          }}
          ref={openingRef}
          data-testid={`${preview ? 'preview-opening' : 'opening'}-${object.id}`}
          role={preview ? undefined : "button"} tabIndex={preview ? undefined : 0} aria-label={`Select ${floorLevelOpening ? 'opening' : object.type} on ${object.wallSide} wall`}
          aria-pressed={isSelected} onKeyDown={handleSelectionKey}
          data-opening-type={floorLevelOpening ? 'floor-level-opening' : object.type}
          data-wall-side={object.wallSide}
          onClick={event => event.stopPropagation()}
          title={object.doorProperties && doorProps.style !== 'sliding' ? "Double-click to flip hand. Drag the wall opening to move the door." : undefined}
          onDoubleClick={handleFlip}
          onMouseDown={preview ? undefined : handleMouseDown}
          onTouchStart={preview ? undefined : handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >{!preview && hitArea}</div>
        
        {doorProps.style !== 'sliding' && (
          <svg data-testid={`door-swing-${object.id}`} data-door-hinge={doorProps.swingSide}
            data-door-direction={doorProps.swingDirection} data-door-style={doorProps.style}
            aria-hidden="true" style={{ position: 'absolute', left: origin.x, top: origin.y,
              width: swingSize, height: swingSize, overflow: 'visible', pointerEvents: 'none', zIndex: 15, opacity: 0.8 }}>
            <g transform={transform}>
              {!preview && <path data-testid={`door-hit-${object.id}`} d={sectorPath}
                fill="transparent" stroke="transparent" strokeWidth={Math.max(3, 8 / Math.max(scale, 0.05))}
                style={{ pointerEvents: 'all', cursor: 'pointer' }}
                onMouseDown={handleSwingPress} onTouchStart={handleSwingTouch}
                onTouchEnd={handleTouchEnd} onTouchCancel={handleTouchEnd}
                onClick={event => event.stopPropagation()} onDoubleClick={handleFlip} />}
              <path data-door-outline="true" d={leafArcPath}
                fill="none" stroke={isSelected ? '#2563EB' : '#FF6B35'} strokeWidth="1.5" strokeDasharray="4,2" />
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
      <div aria-hidden={preview || undefined} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: preview ? 'none' : undefined }}>
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
          ref={openingRef}
          data-testid={`${preview ? 'preview-opening' : 'opening'}-${object.id}`}
          role={preview ? undefined : "button"} tabIndex={preview ? undefined : 0} aria-label={`Select ${floorLevelOpening ? 'opening' : object.type} on ${object.wallSide} wall`}
          aria-pressed={isSelected} onKeyDown={handleSelectionKey}
          data-opening-type={floorLevelOpening ? 'floor-level-opening' : object.type}
          data-wall-side={object.wallSide}
          onClick={event => event.stopPropagation()}
          onDoubleClick={event => event.stopPropagation()}
          onMouseDown={preview ? undefined : handleMouseDown}
          onTouchStart={preview ? undefined : handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >{!preview && hitArea}</div>
        
        {/* Window frame lines - simple parallel lines */}
        {!floorLevelOpening && <svg
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
        </svg>}
      </div>
    );
  }

  return null;
};

export default RoomObject;