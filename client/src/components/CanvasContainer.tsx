import React, { useRef, useEffect, useState } from 'react';
import { Room, Position, ResizeHandle, CanvasState } from '@/utils/types';
import CanvasControls from './CanvasControls';
import RoomBox from './RoomBox';
import { 
  GRID_SIZE, 
  SCALE_FACTOR, 
  snapToGrid, 
  createRoom, 
  getResizedRoom, 
  getResizeHandlePosition 
} from '@/utils/canvas';

interface CanvasContainerProps {
  activeTool: string;
  rooms: Room[];
  selectedRoomId: string | null;
  onRoomsChange: (rooms: Room[]) => void;
  onSelectRoom: (roomId: string | null) => void;
}

const CanvasContainer: React.FC<CanvasContainerProps> = ({
  activeTool,
  rooms,
  selectedRoomId,
  onRoomsChange,
  onSelectRoom,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  
  const [state, setState] = useState<CanvasState>({
    rooms: [],
    selectedRoomId: null,
    scale: 1,
    offset: { x: 0, y: 0 },
    isDragging: false,
    isResizing: false,
    isDrawing: false,
    drawStart: null,
    drawEnd: null,
    lastMouse: { x: 0, y: 0 },
    activeResizeHandle: null,
  });
  
  // Update local state when props change
  useEffect(() => {
    setState(prev => ({
      ...prev,
      rooms,
      selectedRoomId,
    }));
  }, [rooms, selectedRoomId]);
  
  // Zoom functions
  const handleZoomIn = () => {
    setState(prev => ({
      ...prev,
      scale: prev.scale * SCALE_FACTOR,
    }));
  };
  
  const handleZoomOut = () => {
    setState(prev => ({
      ...prev,
      scale: prev.scale / SCALE_FACTOR,
    }));
  };
  
  const handleResetZoom = () => {
    setState(prev => ({
      ...prev,
      scale: 1,
    }));
    
    if (wrapperRef.current) {
      wrapperRef.current.scrollLeft = 0;
      wrapperRef.current.scrollTop = 0;
    }
  };
  
  // Canvas event handlers
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.target !== canvasRef.current) return;
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = (e.clientX - rect.left) / state.scale;
    const y = (e.clientY - rect.top) / state.scale;
    
    if (activeTool === 'room') {
      setState(prev => ({
        ...prev,
        isDrawing: true,
        drawStart: { x, y },
        drawEnd: { x, y },
      }));
    } else {
      // Deselect when clicking on empty canvas
      onSelectRoom(null);
    }
  };
  
  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = (e.clientX - rect.left) / state.scale;
    const y = (e.clientY - rect.top) / state.scale;
    
    if (state.isDrawing && state.drawStart) {
      setState(prev => ({
        ...prev,
        drawEnd: { x, y },
      }));
    } else if (state.isDragging && selectedRoomId) {
      const dx = (e.clientX - state.lastMouse.x) / state.scale;
      const dy = (e.clientY - state.lastMouse.y) / state.scale;
      
      const updatedRooms = rooms.map(room => {
        if (room.id === selectedRoomId) {
          return {
            ...room,
            x: snapToGrid(room.x + dx),
            y: snapToGrid(room.y + dy),
          };
        }
        return room;
      });
      
      onRoomsChange(updatedRooms);
      
      setState(prev => ({
        ...prev,
        lastMouse: { x: e.clientX, y: e.clientY },
      }));
    } else if (state.isResizing && selectedRoomId && state.activeResizeHandle) {
      const selectedRoom = rooms.find(room => room.id === selectedRoomId);
      if (!selectedRoom) return;
      
      const newRoom = getResizedRoom(selectedRoom, state.activeResizeHandle, { x, y });
      
      const updatedRooms = rooms.map(room => {
        if (room.id === selectedRoomId) {
          return newRoom;
        }
        return room;
      });
      
      onRoomsChange(updatedRooms);
    }
  };
  
  const handleCanvasMouseUp = () => {
    if (state.isDrawing && state.drawStart && state.drawEnd) {
      const { x: x1, y: y1 } = state.drawStart;
      const { x: x2, y: y2 } = state.drawEnd;
      
      const x = Math.min(x1, x2);
      const y = Math.min(y1, y2);
      const width = Math.abs(x2 - x1);
      const height = Math.abs(y2 - y1);
      
      if (width > 20 && height > 20) {
        const newRoom = createRoom(x, y, width, height);
        onRoomsChange([...rooms, newRoom]);
        onSelectRoom(newRoom.id);
      }
    }
    
    setState(prev => ({
      ...prev,
      isDrawing: false,
      isDragging: false,
      isResizing: false,
      drawStart: null,
      drawEnd: null,
      activeResizeHandle: null,
    }));
  };
  
  const handleRoomSelect = (roomId: string) => {
    onSelectRoom(roomId);
  };
  
  const handleRoomMoveStart = (roomId: string, clientX: number, clientY: number) => {
    setState(prev => ({
      ...prev,
      isDragging: true,
      lastMouse: { x: clientX, y: clientY },
    }));
    onSelectRoom(roomId);
  };
  
  const handleRoomResizeStart = (roomId: string, handle: ResizeHandle) => {
    setState(prev => ({
      ...prev,
      isResizing: true,
      activeResizeHandle: handle,
    }));
    onSelectRoom(roomId);
  };
  
  // Calculate canvas style based on scale
  const canvasStyle: React.CSSProperties = {
    width: '2000px',
    height: '2000px',
    transformOrigin: '0 0',
    transform: `scale(${state.scale})`,
    backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
    backgroundImage: `
      linear-gradient(to right, rgba(209, 213, 219, 0.3) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(209, 213, 219, 0.3) 1px, transparent 1px)
    `,
  };
  
  return (
    <main className="flex-grow relative overflow-hidden">
      <CanvasControls
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetZoom={handleResetZoom}
      />
      
      <div 
        ref={wrapperRef} 
        className="w-full h-full overflow-auto bg-slate-100"
      >
        <div
          ref={canvasRef}
          className="relative bg-white cursor-crosshair"
          style={canvasStyle}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
        >
          {rooms.map(room => (
            <RoomBox
              key={room.id}
              room={room}
              isSelected={room.id === selectedRoomId}
              onSelect={handleRoomSelect}
              onMoveStart={handleRoomMoveStart}
              onResizeStart={handleRoomResizeStart}
              scale={state.scale}
            />
          ))}
          
          {/* Preview box when drawing */}
          {state.isDrawing && state.drawStart && state.drawEnd && (
            <div
              className="absolute border-2 border-dashed border-primary bg-primary/10"
              style={{
                left: `${Math.min(state.drawStart.x, state.drawEnd.x)}px`,
                top: `${Math.min(state.drawStart.y, state.drawEnd.y)}px`,
                width: `${Math.abs(state.drawEnd.x - state.drawStart.x)}px`,
                height: `${Math.abs(state.drawEnd.y - state.drawStart.y)}px`,
              }}
            />
          )}
        </div>
      </div>
    </main>
  );
};

export default CanvasContainer;
