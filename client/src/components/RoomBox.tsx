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

import React, { useState, useRef } from 'react';
import { Room, Position, ResizeHandle, WallSide, ObjectType } from '@/utils/types';
import { formatDimensions, getResizeHandlePosition, detectWallClick, inchesToPixels } from '@/utils/canvas';
import RoomLabel from './RoomLabel';
import RoomObject from './RoomObject';

interface RoomBoxProps {
  room: Room;
  isSelected: boolean;
  onSelect: (roomId: string, individual?: boolean) => void;
  onResizeStart: (roomId: string, handle: ResizeHandle) => void;
  onMoveStart: (roomId: string, clientX: number, clientY: number, additive?: boolean) => void;
  onUpdateRoom: (roomId: string, updates: Partial<Room>) => void;
  onWallClick?: (roomId: string, position: Position) => void;
  onObjectSelect?: (objectId: string) => void;
  onObjectDragStart?: (objectId: string, clientX: number, clientY: number) => void;
  selectedObjectId?: string | null;
  placingObjectType?: ObjectType | null;
  scale: number;
  isPartOfMultiSelection?: boolean; // New prop for multi-select
  isCanvasPinching?: boolean;
  showRoomNames?: boolean;
  /** Keep read-only physical annotations together when users enlarge text. */
  stackAnnotations?: boolean;
  allowResize?: boolean;
  floorLevelOpenings?: { id: string; wallSide: WallSide; position: number; size: number }[];
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
  isPartOfMultiSelection = false,
  isCanvasPinching = false, showRoomNames = true, stackAnnotations = false, allowResize = true, floorLevelOpenings = []
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
    
    // Selection is handled once on press; click must not collapse a multi-selection.
  };
  
  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Ignore if in object placement mode
    if (placingObjectType) return;
    
    // Only handle left clicks for dragging
    if (e.button !== 0) return;
    
    onMoveStart(room.id, e.clientX, e.clientY, e.shiftKey);
  };
  
  // Track touch interactions
  const [isTouching, setIsTouching] = useState(false);
  
  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    
    // Ignore if in object placement mode
    if (placingObjectType) return;
    
    // Visual feedback for touch
    setIsTouching(true);
    
    // Immediately select the room and start moving
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      onMoveStart(room.id, touch.clientX, touch.clientY);
    }
  };
  
  const handleTouchMove = (e: React.TouchEvent) => {
    
    // Continue through the parent canvas touch handler.

  };
  
  const handleTouchEnd = (e: React.TouchEvent) => {
    
    // Remove touching state
    setIsTouching(false);
  };
  
  const handleResizeStart = (e: React.MouseEvent, handle: ResizeHandle) => {
    e.stopPropagation();
    onResizeStart(room.id, handle);
  };
  
  const handleResizeTouchStart = (e: React.TouchEvent, handle: ResizeHandle) => {
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
      ? '0 0 0 4px rgba(59, 130, 246, 0.8), 0 0 10px rgba(0, 0, 0, 0.2)' 
      : isPartOfMultiSelection
        ? '0 0 0 3px rgba(99, 102, 241, 0.6), inset 0 0 0 1px rgba(255, 255, 255, 0.3)'
        : '0 1px 3px rgba(0, 0, 0, 0.1)',
    cursor: placingObjectType ? 'crosshair' : 'move',
    userSelect: 'none',
    // Opening symbols share the canvas stacking order, including outward swings over neighbors.
    zIndex: 'auto',
    // Add a subtle transition for visual feedback on touch
    transition: 'box-shadow 0.15s ease, transform 0.05s ease',
  };
  
  // Render walls with door openings
  const renderWallsWithOpenings = () => {
    const wallThickness = 2;
    const doors = [...(room.objects?.filter(obj => obj.type === 'door') || []),
      ...floorLevelOpenings.map(object => ({ ...object, type: 'floor-level-opening' }))];
    
    return (
      <>
        {/* Top wall */}
        {renderWallSegments('top', wallThickness, doors)}
        {/* Right wall */}
        {renderWallSegments('right', wallThickness, doors)}
        {/* Bottom wall */}
        {renderWallSegments('bottom', wallThickness, doors)}
        {/* Left wall */}
        {renderWallSegments('left', wallThickness, doors)}
      </>
    );
  };

  const renderWallSegments = (wallSide: WallSide, thickness: number, doors: any[]) => {
    const doorsOnWall = doors.filter(door => door.wallSide === wallSide);
    
    if (doorsOnWall.length === 0) {
      // No doors, render full wall
      return renderFullWall(wallSide, thickness);
    }

    // Sort doors by position
    const sortedDoors = doorsOnWall.sort((a, b) => a.position - b.position);
    const segments = [];
    
    const wallLength = wallSide === 'top' || wallSide === 'bottom' ? room.width : room.height;
    let lastEnd = 0;

    sortedDoors.forEach((door, index) => {
      const doorWidth = door.type === 'floor-level-opening' ? door.size : door.doorProperties ? inchesToPixels(door.doorProperties.width) : 40;
      const doorStart = (door.position / 100) * wallLength - doorWidth / 2;
      const doorEnd = doorStart + doorWidth;

      // Add segment before door
      if (doorStart > lastEnd) {
        segments.push(renderWallSegment(wallSide, thickness, lastEnd, doorStart));
      }

      lastEnd = doorEnd;
    });

    // Add final segment after last door
    if (lastEnd < wallLength) {
      segments.push(renderWallSegment(wallSide, thickness, lastEnd, wallLength));
    }

    return segments;
  };

  const renderFullWall = (wallSide: WallSide, thickness: number) => {
    const style: React.CSSProperties = {
      position: 'absolute',
      backgroundColor: 'currentColor',
      pointerEvents: 'none',
    };

    switch (wallSide) {
      case 'top':
        return <div key={`wall-${wallSide}`} style={{...style, top: 0, left: 0, width: '100%', height: thickness}} />;
      case 'right':
        return <div key={`wall-${wallSide}`} style={{...style, top: 0, right: 0, width: thickness, height: '100%'}} />;
      case 'bottom':
        return <div key={`wall-${wallSide}`} style={{...style, bottom: 0, left: 0, width: '100%', height: thickness}} />;
      case 'left':
        return <div key={`wall-${wallSide}`} style={{...style, top: 0, left: 0, width: thickness, height: '100%'}} />;
    }
  };

  const renderWallSegment = (wallSide: WallSide, thickness: number, start: number, end: number) => {
    const style: React.CSSProperties = {
      position: 'absolute',
      backgroundColor: 'currentColor',
      pointerEvents: 'none',
    };

    const segmentId = `wall-${wallSide}-${start}-${end}`;

    switch (wallSide) {
      case 'top':
        return <div key={segmentId} style={{...style, top: 0, left: start, width: end - start, height: thickness}} />;
      case 'right':
        return <div key={segmentId} style={{...style, top: start, right: 0, width: thickness, height: end - start}} />;
      case 'bottom':
        return <div key={segmentId} style={{...style, bottom: 0, left: start, width: end - start, height: thickness}} />;
      case 'left':
        return <div key={segmentId} style={{...style, top: start, left: 0, width: thickness, height: end - start}} />;
    }
  };

  const resizeHandles: ResizeHandle[] = ['nw', 'ne', 'sw', 'se'];
  
  return (
    <div 
      data-testid={`room-${room.id}`}
      className={`room-box ${isTouching && !isCanvasPinching ? 'room-touching' : ''}`}
      style={{
        ...roomStyle,
        transform: 'none',
        border: 'none', // Remove default border since we're drawing custom walls
      }}
      data-selected={isSelected || isPartOfMultiSelection}
      onClick={handleClick}
      onDoubleClick={e => { if (!placingObjectType) { e.stopPropagation(); onSelect(room.id, true); } }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* Custom walls with door openings */}
      {renderWallsWithOpenings()}
      <div className={stackAnnotations ? "pointer-events-none absolute inset-0 flex flex-col-reverse items-center justify-center gap-1 px-1" : "contents"}>
      {/* Room dimensions display */}
      <div className={(stackAnnotations ? "relative shrink-0" : "absolute inset-0") + " flex items-center justify-center text-xs font-medium text-blue-800 pointer-events-none"}>
        {formatDimensions(room.width, room.height)}
      </div>
      
      {/* Room name */}
      {showRoomNames && <div data-testid={`room-name-${room.id}`} className={stackAnnotations ? "relative min-w-0 max-w-full flex shrink-0 justify-center" : "absolute top-1 left-1 right-1 flex justify-center"} onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
        <RoomLabel
          name={room.name || 'Room'}
          isEditing={isEditingName}
          onStartEdit={handleStartEditName}
          onSave={handleSaveName}
        />
      </div>}
      
      </div>
      {/* Resize handles - shown only when selected */}
      {isSelected && allowResize && !placingObjectType && resizeHandles.map(handle => {
        const position = getResizeHandlePosition(room, handle);
        return (
          <div
            key={handle}
            data-testid={`resize-${room.id}-${handle}`}
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
      
      {floorLevelOpenings.map(object => <RoomObject key={'floor-gap-' + object.id} room={room}
        object={{ ...object, type: 'window' }} floorLevelOpening scale={scale}
        isSelected={selectedObjectId === object.id} onSelect={onObjectSelect ?? (() => {})} />)}
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
          onFlipHand={id => onUpdateRoom(room.id, { objects: room.objects?.map(item =>
            item.id === id && item.doorProperties && item.doorProperties.style !== 'sliding'
              ? { ...item, doorProperties: { ...item.doorProperties,
                  swingSide: item.doorProperties.swingSide === 'left' ? 'right' : 'left' } }
              : item) })}
        />
      ))}
    </div>
  );
};

export default RoomBox;