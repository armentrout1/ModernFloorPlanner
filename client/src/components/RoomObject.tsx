import React, { useState } from 'react';
import { Room, RoomObject as RoomObjectType } from '@/utils/types';
import { DoorOpenIcon, Square as WindowIcon } from 'lucide-react';
import { calculateObjectPosition } from '@/utils/canvas';

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
    const { type, size, wallSide } = object;
    let styles: React.CSSProperties = {
      position: 'absolute',
      pointerEvents: 'all',
      cursor: 'pointer',
      zIndex: isSelected ? 30 : 20,
    };
    
    // Size of the object
    const objSize = size || (type === 'door' ? 40 : 30);
    
    // Position object based on wall side
    switch (wallSide) {
      case 'top':
        // For top wall - position horizontally based on percentage, vertically at the top edge
        styles.left = `${(room.width * object.position / 100) - objSize / 2}px`;
        styles.top = `-${objSize / 2}px`;
        styles.width = `${objSize}px`;
        styles.height = `${objSize}px`;
        styles.transform = 'rotate(0deg)';
        break;
      case 'right':
        // For right wall - position horizontally at the right edge, vertically based on percentage
        styles.left = `${room.width - objSize / 2}px`;
        styles.top = `${(room.height * object.position / 100) - objSize / 2}px`;
        styles.width = `${objSize}px`;
        styles.height = `${objSize}px`;
        styles.transform = 'rotate(90deg)';
        break;
      case 'bottom':
        // For bottom wall - position horizontally based on percentage, vertically at the bottom edge
        styles.left = `${(room.width * object.position / 100) - objSize / 2}px`;
        styles.top = `${room.height - objSize / 2}px`;
        styles.width = `${objSize}px`;
        styles.height = `${objSize}px`;
        styles.transform = 'rotate(180deg)';
        break;
      case 'left':
        // For left wall - position horizontally at the left edge, vertically based on percentage
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
  );
};

export default RoomObject;