import React, { useState } from 'react';
import { Room, Position, ResizeHandle, WallSide, ObjectType } from '@/utils/types';
import { formatDimensions, getResizeHandlePosition, detectWallClick } from '@/utils/canvas';
import RoomLabel from './RoomLabel';
import RoomObject from './RoomObject';

interface RoomBoxProps {
  room: Room;
  isSelected: boolean;
  onSelect: (roomId: string) => void;
  onResizeStart: (roomId: string, handle: ResizeHandle) => void;
  onMoveStart: (roomId: string, clientX: number, clientY: number) => void;
  onUpdateRoom: (roomId: string, updates: Partial<Room>) => void;
  onWallClick?: (roomId: string, position: Position) => void;
  onObjectSelect?: (objectId: string) => void;
  onObjectDragStart?: (objectId: string, clientX: number, clientY: number) => void;
  selectedObjectId?: string | null;
  placingObjectType?: ObjectType | null;
  scale: number;
  isPartOfMultiSelection?: boolean; // New prop for multi-select
}

const RoomBox: React.FC<RoomBoxProps> = ({
  room,
  isSelected,
  onSelect,
  onResizeStart,
  onMoveStart,
  onUpdateRoom,
  onWallClick,
  onObjectSelect,
  onObjectDragStart,
  selectedObjectId,
  placingObjectType,
  scale,
  isPartOfMultiSelection = false
}) => {
  const [isEditingName, setIsEditingName] = useState(false);
  
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // If we're in object placement mode, check for wall clicks
    if (placingObjectType && onWallClick) {
      // Convert click to room-relative position
      const roomRelativePosition: Position = {
        x: e.nativeEvent.offsetX,
        y: e.nativeEvent.offsetY
      };
      
      // Pass to parent for wall detection
      onWallClick(room.id, roomRelativePosition);
      return;
    }
    
    onSelect(room.id);
  };
  
  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Ignore if in object placement mode
    if (placingObjectType) return;
    
    // Only handle left clicks for dragging
    if (e.button !== 0) return;
    
    onSelect(room.id);
    onMoveStart(room.id, e.clientX, e.clientY);
  };
  
  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    
    // Prevent default to avoid scrolling
    e.preventDefault();
    
    // Ignore if in object placement mode
    if (placingObjectType) return;
    
    // Use the first touch point
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      onSelect(room.id);
      onMoveStart(room.id, touch.clientX, touch.clientY);
    }
  };
  
  const handleResizeStart = (e: React.MouseEvent, handle: ResizeHandle) => {
    e.stopPropagation();
    onResizeStart(room.id, handle);
  };
  
  const handleStartEditName = () => {
    setIsEditingName(true);
  };
  
  const handleSaveName = (newName: string) => {
    setIsEditingName(false);
    if (newName.trim() !== room.name) {
      onUpdateRoom(room.id, { name: newName.trim() });
    }
  };
  
  const roomStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${room.x}px`,
    top: `${room.y}px`,
    width: `${room.width}px`,
    height: `${room.height}px`,
    backgroundColor: room.color || '#93c5fd',
    borderRadius: '2px',
    boxShadow: isSelected 
      ? '0 0 0 2px rgba(59, 130, 246, 0.8)' 
      : isPartOfMultiSelection
        ? '0 0 0 2px rgba(99, 102, 241, 0.6), inset 0 0 0 1px rgba(255, 255, 255, 0.3)'
        : '0 1px 3px rgba(0, 0, 0, 0.1)',
    cursor: placingObjectType ? 'crosshair' : 'move',
    userSelect: 'none',
    zIndex: isSelected || isPartOfMultiSelection ? 10 : 1,
  };
  
  const resizeHandles: ResizeHandle[] = ['nw', 'ne', 'sw', 'se'];
  
  return (
    <div 
      className="room-box" 
      style={roomStyle}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
    >
      {/* Room dimensions display */}
      <div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-blue-800 pointer-events-none">
        {formatDimensions(room.width, room.height)}
      </div>
      
      {/* Room name */}
      <div className="absolute top-1 left-1 right-1 flex justify-center">
        <RoomLabel
          name={room.name || 'Room'}
          isEditing={isEditingName}
          onStartEdit={handleStartEditName}
          onSave={handleSaveName}
        />
      </div>
      
      {/* Resize handles - shown only when selected */}
      {isSelected && !placingObjectType && resizeHandles.map(handle => {
        const position = getResizeHandlePosition(room, handle);
        return (
          <div
            key={handle}
            className="absolute w-3 h-3 bg-white border border-blue-500 rounded-sm cursor-nwse-resize z-20"
            style={{
              left: handle.includes('w') ? -4 : undefined,
              right: handle.includes('e') ? -4 : undefined,
              top: handle.includes('n') ? -4 : undefined,
              bottom: handle.includes('s') ? -4 : undefined,
              cursor: `${handle}-resize`,
            }}
            onMouseDown={(e) => handleResizeStart(e, handle as ResizeHandle)}
          />
        );
      })}
      
      {/* Room objects (doors and windows) */}
      {room.objects && room.objects.map(object => (
        <RoomObject 
          key={object.id}
          room={room}
          object={object}
          scale={scale}
          isSelected={selectedObjectId === object.id}
          onSelect={onObjectSelect || (() => {})}
          onDragStart={onObjectDragStart}
        />
      ))}
    </div>
  );
};

export default RoomBox;