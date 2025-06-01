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
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(object.id);
    if (onDragStart) {
      onDragStart(object.id, e.clientX, e.clientY);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(object.id);
    if (onDragStart && e.touches[0]) {
      onDragStart(object.id, e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // Calculate object position and size
  const getObjectStyles = () => {
    const size = object.type === 'door' 
      ? (object.doorProperties ? inchesToPixels(object.doorProperties.width) : 40)
      : 30;
    
    let styles: React.CSSProperties = {
      position: 'absolute',
      cursor: 'pointer',
      zIndex: isSelected ? 30 : 20,
    };

    // Position based on wall side
    switch (object.wallSide) {
      case 'top':
        styles.left = `${(room.width * object.position / 100) - size / 2}px`;
        styles.top = '0px';
        styles.width = `${size}px`;
        styles.height = '6px';
        break;
      case 'right':
        styles.left = `${room.width - 6}px`;
        styles.top = `${(room.height * object.position / 100) - size / 2}px`;
        styles.width = '6px';
        styles.height = `${size}px`;
        break;
      case 'bottom':
        styles.left = `${(room.width * object.position / 100) - size / 2}px`;
        styles.top = `${room.height - 6}px`;
        styles.width = `${size}px`;
        styles.height = '6px';
        break;
      case 'left':
        styles.left = '0px';
        styles.top = `${(room.height * object.position / 100) - size / 2}px`;
        styles.width = '6px';
        styles.height = `${size}px`;
        break;
    }

    return styles;
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
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        />
        
        {/* Door swing - using same logic as preview */}
        {doorProps.style !== 'sliding' && (
          <svg
            style={{
              position: 'absolute',
              width: `${doorSize}px`,
              height: `${doorSize}px`,
              pointerEvents: 'none',
              zIndex: 15,
              opacity: 0.7,
              ...((() => {
                const svgStyle: React.CSSProperties = {};
                
                switch (object.wallSide) {
                  case 'top':
                    svgStyle.left = `${(room.width * object.position / 100) - doorSize / 2}px`;
                    svgStyle.top = `6px`;
                    break;
                  case 'right':
                    svgStyle.left = `${room.width - 6 - doorSize}px`;
                    svgStyle.top = `${(room.height * object.position / 100) - doorSize / 2}px`;
                    break;
                  case 'bottom':
                    svgStyle.left = `${(room.width * object.position / 100) - doorSize / 2}px`;
                    svgStyle.top = `${room.height - 6 - doorSize}px`;
                    break;
                  case 'left':
                    svgStyle.left = `6px`;
                    svgStyle.top = `${(room.height * object.position / 100) - doorSize / 2}px`;
                    break;
                }
                
                return svgStyle;
              })())
            }}
          >
            <path
              d={(() => {
                // Use exact same logic as preview
                switch (object.wallSide) {
                  case 'top':
                    return `M 0 0 L ${doorSize} 0 A ${doorSize} ${doorSize} 0 0 1 0 ${doorSize} Z`;
                  case 'right':
                    return `M ${doorSize} 0 L ${doorSize} ${doorSize} A ${doorSize} ${doorSize} 0 0 1 0 0 Z`;
                  case 'bottom':
                    return `M ${doorSize} ${doorSize} L 0 ${doorSize} A ${doorSize} ${doorSize} 0 0 1 ${doorSize} 0 Z`;
                  case 'left':
                    return `M 0 ${doorSize} L 0 0 A ${doorSize} ${doorSize} 0 0 1 ${doorSize} ${doorSize} Z`;
                  default:
                    return `M 0 0 L ${doorSize} 0 A ${doorSize} ${doorSize} 0 0 1 0 ${doorSize} Z`;
                }
              })()}
              fill="none"
              stroke="#FF6B35"
              strokeWidth="1.5"
              strokeDasharray="4,2"
            />
          </svg>
        )}
      </div>
    );
  }

  // Render window - Real architectural style
  if (object.type === 'window') {
    const windowSize = 48; // Standard window width

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
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        />
        
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