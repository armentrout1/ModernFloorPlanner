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
        
        {/* Door swing arc and door line */}
        {doorProps.style !== 'sliding' && (
          <svg
            style={{
              position: 'absolute',
              ...(() => {
                const arcSize = doorSize;
                const styles: React.CSSProperties = {
                  width: `${arcSize}px`,
                  height: `${arcSize}px`,
                  pointerEvents: 'none',
                  zIndex: 15,
                };

                // Position swing arc based on wall and swing direction
                switch (object.wallSide) {
                  case 'top':
                    styles.left = `${(room.width * object.position / 100) - doorSize / 2 + (isRightSwing ? 0 : doorSize - arcSize)}px`;
                    styles.top = isInward ? '6px' : `-${arcSize - 6}px`;
                    break;
                  case 'right':
                    styles.left = isInward ? `${room.width - 6 - arcSize}px` : `${room.width - 6}px`;
                    styles.top = `${(room.height * object.position / 100) - doorSize / 2 + (isRightSwing ? doorSize - arcSize : 0)}px`;
                    break;
                  case 'bottom':
                    styles.left = `${(room.width * object.position / 100) - doorSize / 2 + (isRightSwing ? doorSize - arcSize : 0)}px`;
                    styles.top = isInward ? `${room.height - 6 - arcSize}px` : `${room.height - 6}px`;
                    break;
                  case 'left':
                    styles.left = isInward ? '6px' : `-${arcSize - 6}px`;
                    styles.top = `${(room.height * object.position / 100) - doorSize / 2 + (isRightSwing ? 0 : doorSize - arcSize)}px`;
                    break;
                }

                return styles;
              })()
            }}
          >
            {/* Door swing arc */}
            <path
              d={`M 0 0 L ${doorSize} 0 A ${doorSize} ${doorSize} 0 0 1 0 ${doorSize}`}
              fill="none"
              stroke="#FF6B35"
              strokeWidth="1.5"
              strokeDasharray="4,2"
              opacity="0.7"
              transform={(() => {
                // Calculate rotation based on wall side and swing direction
                let rotation = 0;
                const center = doorSize / 2;

                switch (object.wallSide) {
                  case 'top':
                    rotation = isRightSwing ? 0 : -90;
                    break;
                  case 'right':
                    rotation = isRightSwing ? 90 : 180;
                    break;
                  case 'bottom':
                    rotation = isRightSwing ? 180 : 90;
                    break;
                  case 'left':
                    rotation = isRightSwing ? -90 : 0;
                    break;
                }

                if (!isInward) {
                  rotation += 180;
                }

                return `rotate(${rotation} ${center} ${center})`;
              })()}
            />
            
            {/* Door swing line (jagged line showing door when open) */}
            <path
              d={(() => {
                const createJaggedLine = (x1: number, y1: number, x2: number, y2: number) => {
                  const segments = 6; // Number of jagged segments
                  const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
                  const segmentLength = length / segments;
                  const angle = Math.atan2(y2 - y1, x2 - x1);
                  const jagHeight = 3; // Height of the jags
                  
                  let path = `M ${x1} ${y1}`;
                  
                  for (let i = 1; i <= segments; i++) {
                    const progress = i / segments;
                    const baseX = x1 + (x2 - x1) * progress;
                    const baseY = y1 + (y2 - y1) * progress;
                    
                    // Create jag in the middle of each segment
                    if (i < segments) {
                      const midProgress = (i - 0.5) / segments;
                      const midX = x1 + (x2 - x1) * midProgress;
                      const midY = y1 + (y2 - y1) * midProgress;
                      
                      // Offset perpendicular to the line for jag
                      const perpX = midX + Math.cos(angle + Math.PI / 2) * jagHeight;
                      const perpY = midY + Math.sin(angle + Math.PI / 2) * jagHeight;
                      
                      path += ` L ${perpX} ${perpY} L ${baseX} ${baseY}`;
                    } else {
                      path += ` L ${baseX} ${baseY}`;
                    }
                  }
                  
                  return path;
                };
                
                let x1, y1, x2, y2;
                
                switch (object.wallSide) {
                  case 'top':
                    x1 = isRightSwing ? 0 : doorSize;
                    y1 = 0;
                    x2 = isRightSwing ? doorSize : 0;
                    y2 = doorSize;
                    break;
                  case 'right':
                    x1 = isRightSwing ? doorSize : 0;
                    y1 = isRightSwing ? 0 : doorSize;
                    x2 = isRightSwing ? 0 : doorSize;
                    y2 = isRightSwing ? doorSize : 0;
                    break;
                  case 'bottom':
                    x1 = isRightSwing ? doorSize : 0;
                    y1 = doorSize;
                    x2 = isRightSwing ? 0 : doorSize;
                    y2 = 0;
                    break;
                  case 'left':
                    x1 = isRightSwing ? 0 : doorSize;
                    y1 = isRightSwing ? doorSize : 0;
                    x2 = isRightSwing ? doorSize : 0;
                    y2 = isRightSwing ? 0 : doorSize;
                    break;
                  default:
                    x1 = 0; y1 = 0; x2 = doorSize; y2 = doorSize;
                }
                
                return createJaggedLine(x1, y1, x2, y2);
              })()}
              fill="none"
              stroke="#FF6B35"
              strokeWidth="1.5"
              opacity="0.8"
            />
          </svg>
        )}
      </div>
    );
  }

  // Render window
  if (object.type === 'window') {
    return (
      <div
        style={{
          ...getObjectStyles(),
          backgroundColor: 'rgba(135, 206, 235, 0.8)',
          border: isSelected ? '2px solid #3B82F6' : '2px solid #87CEEB',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <Square 
          size={12}
          color="#4682B4"
        />
      </div>
    );
  }

  return null;
};

export default RoomObject;