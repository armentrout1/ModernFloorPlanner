import React, { useState, useRef } from 'react';
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
  
  // Track touch interactions
  const [isTouching, setIsTouching] = useState(false);
  
  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault(); // Prevent default to avoid scrolling
    
    // Ignore if in object placement mode
    if (placingObjectType) return;
    
    // Visual feedback for touch
    setIsTouching(true);
    
    // Immediately select the room and start moving
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      onSelect(room.id);
      onMoveStart(room.id, touch.clientX, touch.clientY);
    }
  };
  
  const handleTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    // No extra handling needed - parent component will handle the movement
    // since onMoveStart was called in handleTouchStart
  };
  
  const handleTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    
    // Remove touching state
    setIsTouching(false);
  };
  
  const handleResizeStart = (e: React.MouseEvent, handle: ResizeHandle) => {
    e.stopPropagation();
    onResizeStart(room.id, handle);
  };
  
  const handleResizeTouchStart = (e: React.TouchEvent, handle: ResizeHandle) => {
    e.stopPropagation();
    e.preventDefault();
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
      ? '0 0 0 4px rgba(59, 130, 246, 0.8), 0 0 10px rgba(0, 0, 0, 0.2)' 
      : isPartOfMultiSelection
        ? '0 0 0 3px rgba(99, 102, 241, 0.6), inset 0 0 0 1px rgba(255, 255, 255, 0.3)'
        : '0 1px 3px rgba(0, 0, 0, 0.1)',
    cursor: placingObjectType ? 'crosshair' : 'move',
    userSelect: 'none',
    zIndex: isSelected || isPartOfMultiSelection ? 10 : 1,
    // Add a subtle transition for visual feedback on touch
    transition: 'box-shadow 0.15s ease, transform 0.05s ease',
  };
  
  const resizeHandles: ResizeHandle[] = ['nw', 'ne', 'sw', 'se'];
  
  return (
    <div 
      className={`room-box ${isTouching ? 'room-touching' : ''}`}
      style={{
        ...roomStyle,
        transform: isTouching ? 'scale(0.98)' : 'scale(1)',
      }}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
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
            className="absolute resize-handle w-3 h-3 bg-white border-2 border-blue-500 rounded-sm cursor-nwse-resize z-20 
                      shadow-md hover:bg-blue-100 active:bg-blue-200"
            style={{
              left: handle.includes('w') ? -6 : undefined,
              right: handle.includes('e') ? -6 : undefined,
              top: handle.includes('n') ? -6 : undefined,
              bottom: handle.includes('s') ? -6 : undefined,
              cursor: `${handle}-resize`,
              width: '16px',
              height: '16px',
              touchAction: 'none',
            }}
            onMouseDown={(e) => handleResizeStart(e, handle as ResizeHandle)}
            onTouchStart={(e) => handleResizeTouchStart(e, handle as ResizeHandle)}
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