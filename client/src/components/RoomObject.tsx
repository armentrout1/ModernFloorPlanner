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
    
    // Position object based on wall side - keep it simple for doors
    switch (wallSide) {
      case 'top':
        styles.left = `${(room.width * object.position / 100) - objSize / 2}px`;
        styles.top = `0px`;
        styles.width = `${objSize}px`;
        styles.height = `10px`;
        break;
      case 'right':
        styles.left = `${room.width - 10}px`;
        styles.top = `${(room.height * object.position / 100) - objSize / 2}px`;
        styles.width = `10px`;
        styles.height = `${objSize}px`;
        break;
      case 'bottom':
        styles.left = `${(room.width * object.position / 100) - objSize / 2}px`;
        styles.top = `${room.height - 10}px`;
        styles.width = `${objSize}px`;
        styles.height = `10px`;
        break;
      case 'left':
        styles.left = `0px`;
        styles.top = `${(room.height * object.position / 100) - objSize / 2}px`;
        styles.width = `10px`;
        styles.height = `${objSize}px`;
        break;
    }
    
    // Additional styles for selected objects
    if (isSelected) {
      styles.boxShadow = '0 0 0 2px rgba(255, 255, 255, 0.9), 0 0 0 4px rgba(59, 130, 246, 0.9)';
    }
    
    return styles;
  };

  // Render simple door representation
  const renderDoorElements = () => {
    if (object.type !== 'door') return null;

    const doorWidth = object.doorProperties ? inchesToPixels(object.doorProperties.width) : 40;
    
    // Simple door line representation
    const doorStyle: React.CSSProperties = {
      position: 'absolute',
      backgroundColor: '#8B4513',
      pointerEvents: 'none',
      zIndex: 10,
    };

    // Position door line based on wall side
    switch (object.wallSide) {
      case 'top':
        doorStyle.left = '0px';
        doorStyle.top = '2px';
        doorStyle.width = '100%';
        doorStyle.height = '3px';
        break;
      case 'right':
        doorStyle.left = '2px';
        doorStyle.top = '0px';
        doorStyle.width = '3px';
        doorStyle.height = '100%';
        break;
      case 'bottom':
        doorStyle.left = '0px';
        doorStyle.top = '2px';
        doorStyle.width = '100%';
        doorStyle.height = '3px';
        break;
      case 'left':
        doorStyle.left = '2px';
        doorStyle.top = '0px';
        doorStyle.width = '3px';
        doorStyle.height = '100%';
        break;
    }

    return <div style={doorStyle} />;
  };

  // Render simple door swing arc
  const renderDoorSwing = () => {
    if (object.type !== 'door' || !object.doorProperties || 
        ['sliding', 'bifold'].includes(object.doorProperties.style)) {
      return null;
    }

    const doorWidth = object.doorProperties ? inchesToPixels(object.doorProperties.width) : 40;
    const swingRadius = doorWidth * 0.8;
    
    let svgStyle: React.CSSProperties = {
      position: 'absolute',
      width: `${swingRadius}px`,
      height: `${swingRadius}px`,
      pointerEvents: 'none',
      zIndex: isSelected ? 15 : 8,
      opacity: isSelected ? 0.6 : 0.3,
    };

    // Position swing arc based on wall side
    const isRightSwing = object.doorProperties?.swingSide === 'right';
    const isInward = object.doorProperties?.swingDirection === 'inward';

    switch (object.wallSide) {
      case 'top':
        svgStyle.left = isRightSwing ? '0px' : `-${swingRadius - doorWidth}px`;
        svgStyle.top = isInward ? '10px' : `-${swingRadius - 10}px`;
        break;
      case 'right':
        svgStyle.left = isInward ? `-${swingRadius - 10}px` : '10px';
        svgStyle.top = isRightSwing ? '0px' : `-${swingRadius - doorWidth}px`;
        break;
      case 'bottom':
        svgStyle.left = isRightSwing ? `-${swingRadius - doorWidth}px` : '0px';
        svgStyle.top = isInward ? `-${swingRadius - 10}px` : '10px';
        break;
      case 'left':
        svgStyle.left = isInward ? '10px' : `-${swingRadius - 10}px`;
        svgStyle.top = isRightSwing ? `-${swingRadius - doorWidth}px` : '0px';
        break;
    }

    return (
      <svg style={svgStyle} viewBox={`0 0 ${swingRadius} ${swingRadius}`}>
        <path
          d={`M 0 0 L ${swingRadius} 0 A ${swingRadius} ${swingRadius} 0 0 1 0 ${swingRadius} Z`}
          fill="none"
          stroke="#FF6B35"
          strokeWidth="1"
          strokeDasharray="3,2"
          opacity="0.8"
        />
      </svg>
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
        {object.type === 'door' ? (
          <>
            {/* Render door elements */}
            {renderDoorElements()}
          </>
        ) : (
          <div 
            className="w-full h-full flex items-center justify-center text-blue-500"
            style={{
              opacity: isSelected ? 1 : 0.85,
            }}
          >
            <WindowIcon 
              className="w-full h-full p-1"
              style={{ background: 'rgba(255, 255, 255, 0.8)', borderRadius: '4px' }}
            />
          </div>
        )}
      </div>
    </>
  );
};

export default RoomObject;