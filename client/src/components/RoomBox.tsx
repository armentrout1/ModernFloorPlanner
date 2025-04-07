import React from 'react';
import { Room, ResizeHandle } from '@/utils/types';
import { formatDimensions } from '@/utils/canvas';

interface RoomBoxProps {
  room: Room;
  isSelected: boolean;
  onSelect: (roomId: string) => void;
  onResizeStart: (roomId: string, handle: ResizeHandle) => void;
  onMoveStart: (roomId: string, clientX: number, clientY: number) => void;
  scale: number;
}

const RoomBox: React.FC<RoomBoxProps> = ({
  room,
  isSelected,
  onSelect,
  onResizeStart,
  onMoveStart,
  scale,
}) => {
  const { id, x, y, width, height, color = '#93c5fd' } = room;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(id);
  };

  const handleMoveStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    onMoveStart(id, e.clientX, e.clientY);
  };

  const handleResizeStart = (e: React.MouseEvent, handle: ResizeHandle) => {
    e.stopPropagation();
    onResizeStart(id, handle);
  };

  const roomStyle: React.CSSProperties = {
    left: `${x}px`,
    top: `${y}px`,
    width: `${width}px`,
    height: `${height}px`,
    backgroundColor: `${color}33`, // Add transparency
    borderColor: isSelected ? 'hsl(var(--accent))' : 'hsl(var(--primary))',
    zIndex: isSelected ? 10 : 1,
  };

  const roomClasses = `absolute border-2 cursor-move ${isSelected ? 'bg-accent/20 border-accent' : 'bg-primary/20 border-primary'}`;

  return (
    <div
      className={roomClasses}
      style={roomStyle}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleMoveStart}
    >
      <div className="p-2 text-sm text-slate-600" onMouseDown={handleMoveStart}>
        {formatDimensions(width, height)}
      </div>

      {/* Resize handles */}
      <div
        className="absolute w-2.5 h-2.5 bg-white border-2 border-primary rounded-full -top-1.5 -left-1.5 cursor-nwse-resize"
        onMouseDown={(e) => handleResizeStart(e, 'nw')}
      />
      <div
        className="absolute w-2.5 h-2.5 bg-white border-2 border-primary rounded-full -top-1.5 -right-1.5 cursor-nesw-resize"
        onMouseDown={(e) => handleResizeStart(e, 'ne')}
      />
      <div
        className="absolute w-2.5 h-2.5 bg-white border-2 border-primary rounded-full -bottom-1.5 -left-1.5 cursor-nesw-resize"
        onMouseDown={(e) => handleResizeStart(e, 'sw')}
      />
      <div
        className="absolute w-2.5 h-2.5 bg-white border-2 border-primary rounded-full -bottom-1.5 -right-1.5 cursor-nwse-resize"
        onMouseDown={(e) => handleResizeStart(e, 'se')}
      />
    </div>
  );
};

export default RoomBox;
