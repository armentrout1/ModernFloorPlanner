import React, { useState } from 'react';
import { Room, ResizeHandle } from '@/utils/types';
import { formatDimensions, calculateRoomArea, formatArea } from '@/utils/canvas';
import RoomLabel from './RoomLabel';

interface RoomBoxProps {
  room: Room;
  isSelected: boolean;
  onSelect: (roomId: string) => void;
  onResizeStart: (roomId: string, handle: ResizeHandle) => void;
  onMoveStart: (roomId: string, clientX: number, clientY: number) => void;
  onUpdateRoom: (roomId: string, updates: Partial<Room>) => void;
  scale: number;
}

const RoomBox: React.FC<RoomBoxProps> = ({
  room,
  isSelected,
  onSelect,
  onResizeStart,
  onMoveStart,
  onUpdateRoom,
  scale,
}) => {
  const { id, x, y, width, height, name = 'Room', color = '#93c5fd' } = room;
  const [isEditingName, setIsEditingName] = useState(false);
  const roomArea = calculateRoomArea(room);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // If clicking with the main button (usually left click)
    if (e.button === 0) {
      // Select the room first
      onSelect(id);
      
      // Then immediately start moving the room (if not clicking on other controls)
      if (!isEditingName && 
          !(e.target as HTMLElement).closest('.resize-handle') && 
          !(e.target as HTMLElement).closest('.room-label')) {
        onMoveStart(id, e.clientX, e.clientY);
      }
    }
  };

  const handleResizeStart = (e: React.MouseEvent, handle: ResizeHandle) => {
    e.stopPropagation();
    onSelect(id);
    onResizeStart(id, handle);
  };

  const handleStartEditName = () => {
    setIsEditingName(true);
  };

  const handleSaveName = (newName: string) => {
    setIsEditingName(false);
    if (newName.trim() !== name) {
      onUpdateRoom(id, { name: newName.trim() || 'Room' });
    }
  };

  const roomStyle: React.CSSProperties = {
    left: `${x}px`,
    top: `${y}px`,
    width: `${width}px`,
    height: `${height}px`,
    backgroundColor: `${color}33`, // Add transparency
    borderColor: isSelected ? 'hsl(var(--accent))' : 'hsl(var(--primary))',
    zIndex: isSelected ? 10 : 1,
    transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
    boxShadow: isSelected ? '0 4px 8px rgba(0, 0, 0, 0.1)' : 'none',
    touchAction: 'none', // Prevent default touch actions for better touch device handling
  };

  const roomClasses = `absolute border-2 cursor-move select-none ${isSelected ? 'bg-accent/20 border-accent' : 'bg-primary/20 border-primary hover:border-primary/70'}`;

  return (
    <div
      className={roomClasses}
      style={roomStyle}
      onMouseDown={handleMouseDown}
    >
      <div className="p-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-1">
          <div className="room-label">
            <RoomLabel 
              name={name}
              isEditing={isEditingName}
              onStartEdit={handleStartEditName}
              onSave={handleSaveName}
            />
          </div>
          <span className="text-xs text-slate-500">{formatArea(roomArea)}</span>
        </div>
        <div 
          className="text-sm text-slate-600 font-medium bg-white/70 px-1.5 py-0.5 rounded-sm inline-block"
        >
          {formatDimensions(width, height)}
        </div>
      </div>

      {/* Width dimension on top */}
      <div className="absolute top-0 left-0 w-full flex justify-center -translate-y-5 pointer-events-none">
        <div className="text-xs px-1 py-0.5 bg-white/80 rounded shadow-sm">
          {formatDimensions(width, 0).split('×')[0].trim()}
        </div>
      </div>

      {/* Height dimension on right */}
      <div className="absolute top-0 right-0 h-full flex items-center translate-x-5 pointer-events-none">
        <div className="text-xs px-1 py-0.5 bg-white/80 rounded shadow-sm -rotate-90 origin-left">
          {formatDimensions(0, height).split('×')[1].trim()}
        </div>
      </div>

      {/* Resize handles */}
      <div
        className="resize-handle absolute w-3.5 h-3.5 bg-white border-2 border-primary rounded-full -top-2 -left-2 cursor-nwse-resize z-20 hover:scale-110 transition-transform"
        onMouseDown={(e) => handleResizeStart(e, 'nw')}
      />
      <div
        className="resize-handle absolute w-3.5 h-3.5 bg-white border-2 border-primary rounded-full -top-2 -right-2 cursor-nesw-resize z-20 hover:scale-110 transition-transform"
        onMouseDown={(e) => handleResizeStart(e, 'ne')}
      />
      <div
        className="resize-handle absolute w-3.5 h-3.5 bg-white border-2 border-primary rounded-full -bottom-2 -left-2 cursor-nesw-resize z-20 hover:scale-110 transition-transform"
        onMouseDown={(e) => handleResizeStart(e, 'sw')}
      />
      <div
        className="resize-handle absolute w-3.5 h-3.5 bg-white border-2 border-primary rounded-full -bottom-2 -right-2 cursor-nwse-resize z-20 hover:scale-110 transition-transform"
        onMouseDown={(e) => handleResizeStart(e, 'se')}
      />
    </div>
  );
};

export default RoomBox;
