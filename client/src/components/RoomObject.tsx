import React, { useState } from 'react';
import { Room, RoomObject as RoomObjectType, DoorProperties } from '@/utils/types';
import { DoorOpenIcon, Square as WindowIcon } from 'lucide-react';
import { calculateObjectPosition, inchesToPixels } from '@/utils/canvas';

interface RoomObjectProps {
  room: Room;
  object: RoomObjectType;
  scale: number;
  isSelected: boolean;
  onSelect: (objectId: string) => void;
  onDragStart?: (objectId: string, clientX: number, clientY: number) => void;
}

const RoomObject: React.FC<RoomObjectProps> = ({
  room,
  object,
  scale,
  isSelected,
  onSelect,
  onDragStart,
}) => {
  const position = calculateObjectPosition(room, object.wallSide, object.position);
  
  // Calculate styles based on the object wall side and position
  const getStyles = (): React.CSSProperties => {
    const { type, size, wallSide, doorProperties } = object;
    let styles: React.CSSProperties = {
      position: 'absolute',
      pointerEvents: 'all',
      cursor: 'pointer',
      zIndex: isSelected ? 30 : 20,
    };
    
    // Size of the object - use door properties if available
    let objSize = size;
    if (type === 'door' && doorProperties) {
      objSize = inchesToPixels(doorProperties.width);
    } else {
      objSize = size || (type === 'door' ? 40 : 30);
    }
    
    // Position object based on wall side
    switch (wallSide) {
      case 'top':
        styles.left = `${(room.width * object.position / 100) - objSize / 2}px`;
        styles.top = `-${objSize / 2}px`;
        styles.width = `${objSize}px`;
        styles.height = `${objSize}px`;
        styles.transform = 'rotate(0deg)';
        break;
      case 'right':
        styles.left = `${room.width - objSize / 2}px`;
        styles.top = `${(room.height * object.position / 100) - objSize / 2}px`;
        styles.width = `${objSize}px`;
        styles.height = `${objSize}px`;
        styles.transform = 'rotate(90deg)';
        break;
      case 'bottom':
        styles.left = `${(room.width * object.position / 100) - objSize / 2}px`;
        styles.top = `${room.height - objSize / 2}px`;
        styles.width = `${objSize}px`;
        styles.height = `${objSize}px`;
        styles.transform = 'rotate(180deg)';
        break;
      case 'left':
        styles.left = `-${objSize / 2}px`;
        styles.top = `${(room.height * object.position / 100) - objSize / 2}px`;
        styles.width = `${objSize}px`;
        styles.height = `${objSize}px`;
        styles.transform = 'rotate(-90deg)';
        break;
    }
    
    // Additional styles for selected objects
    if (isSelected) {
      styles.boxShadow = '0 0 0 2px rgba(255, 255, 255, 0.9), 0 0 0 4px rgba(59, 130, 246, 0.9)';
    }
    
    return styles;
  };

  // Render door swing arc if this is a door
  const renderDoorSwing = () => {
    if (object.type !== 'door' || !object.doorProperties || object.doorProperties.style === 'sliding') {
      return null;
    }

    const { doorProperties, wallSide } = object;
    const doorWidth = inchesToPixels(doorProperties.width);
    const swingRadius = doorWidth * 0.8; // Swing arc is slightly smaller than door width
    
    // Calculate swing arc position and rotation
    let swingStyles: React.CSSProperties = {
      position: 'absolute',
      width: `${swingRadius * 2}px`,
      height: `${swingRadius * 2}px`,
      border: '1px dashed rgba(255, 165, 0, 0.6)',
      borderRadius: '50%',
      pointerEvents: 'none',
      zIndex: isSelected ? 25 : 15,
    };

    // Position the swing arc based on wall side and swing direction
    const isInward = doorProperties.swingDirection === 'inward';
    const isRightSwing = doorProperties.swingSide === 'right';

    switch (wallSide) {
      case 'top':
        swingStyles.left = `${isRightSwing ? -swingRadius : -swingRadius}px`;
        swingStyles.top = `${isInward ? -swingRadius : -swingRadius}px`;
        break;
      case 'right':
        swingStyles.left = `${isInward ? -swingRadius : -swingRadius}px`;
        swingStyles.top = `${isRightSwing ? -swingRadius : -swingRadius}px`;
        break;
      case 'bottom':
        swingStyles.left = `${isRightSwing ? -swingRadius : -swingRadius}px`;
        swingStyles.top = `${isInward ? -swingRadius : -swingRadius}px`;
        break;
      case 'left':
        swingStyles.left = `${isInward ? -swingRadius : -swingRadius}px`;
        swingStyles.top = `${isRightSwing ? -swingRadius : -swingRadius}px`;
        break;
    }

    return (
      <div 
        style={swingStyles}
        className="opacity-70"
      />
    );
  };
  
  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(object.id);
    
    if (onDragStart && e.button === 0) {
      onDragStart(object.id, e.clientX, e.clientY);
    }
  };
  
  const [isObjectTouching, setIsObjectTouching] = useState(false);
  
  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    // Visual feedback
    setIsObjectTouching(true);
    
    // Select object and start dragging immediately
    onSelect(object.id);
    
    if (onDragStart && e.touches.length === 1) {
      const touch = e.touches[0];
      onDragStart(object.id, touch.clientX, touch.clientY);
    }
  };
  
  const handleTouchEnd = () => {
    setIsObjectTouching(false);
  };
  
  return (
    <>
      {/* Door swing arc - render behind the door */}
      {renderDoorSwing()}
      
      <div
        className={`room-object ${isSelected ? 'selected' : ''} ${isObjectTouching ? 'object-touching' : ''}`}
        style={{
          ...getStyles(),
          transform: isObjectTouching ? 'scale(1.1)' : '',
          zIndex: isObjectTouching ? 50 : (isSelected ? 30 : 20),
        }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <div 
          className={`w-full h-full flex items-center justify-center
                     ${object.type === 'door' ? 'text-orange-500' : 'text-blue-500'} 
                     ${isSelected ? 'opacity-100' : 'opacity-85'}`}
        >
          {object.type === 'door' ? (
            <DoorOpenIcon 
              className="w-full h-full p-1"
              style={{ background: 'rgba(255, 255, 255, 0.8)', borderRadius: '4px' }}
            />
          ) : (
            <WindowIcon 
              className="w-full h-full p-1"
              style={{ background: 'rgba(255, 255, 255, 0.8)', borderRadius: '4px' }}
            />
          )}
        </div>
      </div>
    </>
  );
};

export default RoomObject;