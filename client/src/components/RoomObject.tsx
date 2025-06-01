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

  // Render architectural door representation
  const renderArchitecturalDoor = () => {
    if (object.type !== 'door' || !object.doorProperties) {
      return null;
    }

    const { doorProperties, wallSide } = object;
    const doorWidth = inchesToPixels(doorProperties.width);
    const doorThickness = 4; // Door panel thickness in pixels
    
    const elements = [];
    
    // Door opening (gap in wall)
    const openingStyle: React.CSSProperties = {
      position: 'absolute',
      backgroundColor: 'transparent',
      pointerEvents: 'none',
      zIndex: 5,
    };

    // Door panel (hinge line)
    const panelStyle: React.CSSProperties = {
      position: 'absolute',
      backgroundColor: '#8B4513',
      pointerEvents: 'none',
      zIndex: 10,
    };

    // Position elements based on wall side
    switch (wallSide) {
      case 'top':
        openingStyle.left = `${-doorWidth / 2}px`;
        openingStyle.top = `${-doorThickness / 2}px`;
        openingStyle.width = `${doorWidth}px`;
        openingStyle.height = `${doorThickness}px`;
        
        panelStyle.left = `${doorProperties.swingSide === 'right' ? -doorWidth / 2 : doorWidth / 2 - 2}px`;
        panelStyle.top = `${-doorThickness / 2}px`;
        panelStyle.width = '2px';
        panelStyle.height = `${doorThickness}px`;
        break;
        
      case 'right':
        openingStyle.left = `${-doorThickness / 2}px`;
        openingStyle.top = `${-doorWidth / 2}px`;
        openingStyle.width = `${doorThickness}px`;
        openingStyle.height = `${doorWidth}px`;
        
        panelStyle.left = `${-doorThickness / 2}px`;
        panelStyle.top = `${doorProperties.swingSide === 'right' ? -doorWidth / 2 : doorWidth / 2 - 2}px`;
        panelStyle.width = `${doorThickness}px`;
        panelStyle.height = '2px';
        break;
        
      case 'bottom':
        openingStyle.left = `${-doorWidth / 2}px`;
        openingStyle.top = `${-doorThickness / 2}px`;
        openingStyle.width = `${doorWidth}px`;
        openingStyle.height = `${doorThickness}px`;
        
        panelStyle.left = `${doorProperties.swingSide === 'right' ? doorWidth / 2 - 2 : -doorWidth / 2}px`;
        panelStyle.top = `${-doorThickness / 2}px`;
        panelStyle.width = '2px';
        panelStyle.height = `${doorThickness}px`;
        break;
        
      case 'left':
        openingStyle.left = `${-doorThickness / 2}px`;
        openingStyle.top = `${-doorWidth / 2}px`;
        openingStyle.width = `${doorThickness}px`;
        openingStyle.height = `${doorWidth}px`;
        
        panelStyle.left = `${-doorThickness / 2}px`;
        panelStyle.top = `${doorProperties.swingSide === 'right' ? doorWidth / 2 - 2 : -doorWidth / 2}px`;
        panelStyle.width = `${doorThickness}px`;
        panelStyle.height = '2px';
        break;
    }

    elements.push(
      <div key="opening" style={openingStyle} />,
      <div key="panel" style={panelStyle} />
    );

    return elements;
  };

  // Render door swing arc for hinged doors
  const renderDoorSwing = () => {
    if (object.type !== 'door' || !object.doorProperties || 
        ['sliding', 'bifold'].includes(object.doorProperties.style)) {
      return null;
    }

    const { doorProperties, wallSide } = object;
    const doorWidth = inchesToPixels(doorProperties.width);
    const swingRadius = doorWidth * 0.9;
    
    // Create SVG for quarter-circle arc
    const svgSize = swingRadius + 10;
    let svgStyle: React.CSSProperties = {
      position: 'absolute',
      width: `${svgSize}px`,
      height: `${svgSize}px`,
      pointerEvents: 'none',
      zIndex: isSelected ? 15 : 8,
      opacity: isSelected ? 0.8 : 0.4,
    };

    // Calculate arc positioning and rotation
    const isInward = doorProperties.swingDirection === 'inward';
    const isRightSwing = doorProperties.swingSide === 'right';
    
    let arcPath = '';
    let transform = '';
    
    // Create quarter-circle path
    const centerX = 5;
    const centerY = 5;
    
    switch (wallSide) {
      case 'top':
        svgStyle.left = `${isRightSwing ? -swingRadius - 5 : -5}px`;
        svgStyle.top = `${isInward ? -5 : -swingRadius - 5}px`;
        arcPath = `M ${centerX} ${centerY} L ${centerX + swingRadius} ${centerY} A ${swingRadius} ${swingRadius} 0 0 ${isInward ? 1 : 0} ${centerX} ${centerY + (isInward ? swingRadius : -swingRadius)}`;
        transform = isRightSwing ? '' : `rotate(180 ${centerX} ${centerY})`;
        break;
        
      case 'right':
        svgStyle.left = `${isInward ? -swingRadius - 5 : -5}px`;
        svgStyle.top = `${isRightSwing ? -swingRadius - 5 : -5}px`;
        arcPath = `M ${centerX} ${centerY} L ${centerX} ${centerY + swingRadius} A ${swingRadius} ${swingRadius} 0 0 ${isInward ? 0 : 1} ${centerX + (isInward ? -swingRadius : swingRadius)} ${centerY}`;
        transform = isRightSwing ? '' : `rotate(180 ${centerX} ${centerY})`;
        break;
        
      case 'bottom':
        svgStyle.left = `${isRightSwing ? -5 : -swingRadius - 5}px`;
        svgStyle.top = `${isInward ? -swingRadius - 5 : -5}px`;
        arcPath = `M ${centerX} ${centerY} L ${centerX - swingRadius} ${centerY} A ${swingRadius} ${swingRadius} 0 0 ${isInward ? 0 : 1} ${centerX} ${centerY + (isInward ? -swingRadius : swingRadius)}`;
        transform = isRightSwing ? '' : `rotate(180 ${centerX} ${centerY})`;
        break;
        
      case 'left':
        svgStyle.left = `${isInward ? -5 : -swingRadius - 5}px`;
        svgStyle.top = `${isRightSwing ? -5 : -swingRadius - 5}px`;
        arcPath = `M ${centerX} ${centerY} L ${centerX} ${centerY - swingRadius} A ${swingRadius} ${swingRadius} 0 0 ${isInward ? 1 : 0} ${centerX + (isInward ? swingRadius : -swingRadius)} ${centerY}`;
        transform = isRightSwing ? '' : `rotate(180 ${centerX} ${centerY})`;
        break;
    }

    return (
      <svg style={svgStyle} viewBox={`0 0 ${svgSize} ${svgSize}`}>
        <path
          d={arcPath}
          fill="none"
          stroke="#FF6B35"
          strokeWidth="1"
          strokeDasharray="3,2"
          transform={transform}
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
            {/* Render architectural door elements */}
            {renderArchitecturalDoor()}
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