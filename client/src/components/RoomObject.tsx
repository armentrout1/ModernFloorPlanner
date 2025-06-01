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

  // Render window - Professional architectural style
  if (object.type === 'window') {
    const windowSize = 36; // Standard window size

    return (
      <div style={{ position: 'absolute' }}>
        {/* Main window opening - thicker line break in wall */}
        <div
          style={{
            position: 'absolute',
            backgroundColor: '#FFFFFF', // White background to show wall break
            border: isSelected ? '2px solid #3B82F6' : '1px solid #333',
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
        
        {/* Window sill lines - professional architectural representation */}
        <svg
          style={{
            position: 'absolute',
            width: `${windowSize}px`,
            height: `${windowSize}px`,
            pointerEvents: 'none',
            zIndex: 15,
            ...((() => {
              const svgStyle: React.CSSProperties = {};
              
              switch (object.wallSide) {
                case 'top':
                  svgStyle.left = `${(room.width * object.position / 100) - windowSize / 2}px`;
                  svgStyle.top = `2px`;
                  break;
                case 'right':
                  svgStyle.left = `${room.width - 6 - windowSize}px`;
                  svgStyle.top = `${(room.height * object.position / 100) - windowSize / 2}px`;
                  break;
                case 'bottom':
                  svgStyle.left = `${(room.width * object.position / 100) - windowSize / 2}px`;
                  svgStyle.top = `${room.height - 6 - windowSize}px`;
                  break;
                case 'left':
                  svgStyle.left = `2px`;
                  svgStyle.top = `${(room.height * object.position / 100) - windowSize / 2}px`;
                  break;
              }
              
              return svgStyle;
            })())
          }}
        >
          {/* Professional window sill lines */}
          {object.wallSide === 'top' || object.wallSide === 'bottom' ? (
            <>
              {/* Top/bottom walls - two horizontal parallel lines */}
              <line x1="0" y1="2" x2={windowSize} y2="2" stroke="#333" strokeWidth="1.5" />
              <line x1="0" y1="6" x2={windowSize} y2="6" stroke="#333" strokeWidth="1.5" />
              {/* Window frame divisions */}
              <line x1={windowSize/3} y1="2" x2={windowSize/3} y2="6" stroke="#333" strokeWidth="1" />
              <line x1={2*windowSize/3} y1="2" x2={2*windowSize/3} y2="6" stroke="#333" strokeWidth="1" />
            </>
          ) : (
            <>
              {/* Left/right walls - two vertical parallel lines */}
              <line x1="2" y1="0" x2="2" y2={windowSize} stroke="#333" strokeWidth="1.5" />
              <line x1="6" y1="0" x2="6" y2={windowSize} stroke="#333" strokeWidth="1.5" />
              {/* Window frame divisions */}
              <line x1="2" y1={windowSize/3} x2="6" y2={windowSize/3} stroke="#333" strokeWidth="1" />
              <line x1="2" y1={2*windowSize/3} x2="6" y2={2*windowSize/3} stroke="#333" strokeWidth="1" />
            </>
          )}
        </svg>
      </div>
    );
  }

  return null;
};

export default RoomObject;