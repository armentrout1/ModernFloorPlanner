import React, { useRef, useEffect, useState } from 'react';
import { Room, Position, ResizeHandle, CanvasState } from '@/utils/types';
import CanvasControls from './CanvasControls';
import RoomBox from './RoomBox';
import TotalAreaDisplay from './TotalAreaDisplay';
import { 
  GRID_SIZE, 
  SCALE_FACTOR, 
  snapToGrid, 
  createRoom, 
  getResizedRoom 
} from '@/utils/canvas';

interface CanvasContainerProps {
  activeTool: string;
  rooms: Room[];
  selectedRoomId: string | null;
  onRoomsChange: (rooms: Room[]) => void;
  onSelectRoom: (roomId: string | null) => void;
  onUpdateRoom: (roomId: string, updates: Partial<Room>) => void;
}

const CanvasContainer: React.FC<CanvasContainerProps> = ({
  activeTool,
  rooms,
  selectedRoomId,
  onRoomsChange,
  onSelectRoom,
  onUpdateRoom,
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
  
  // Check for rooms that are close to each other for snapping
  const checkRoomProximity = (testRoom: Room): Room => {
    const snapThreshold = GRID_SIZE * 0.75; // Slightly less than 1 foot in pixels for better feel
    let snappedRoom = { ...testRoom };
    
    // Don't check proximity if this is the only room
    if (rooms.length <= 1) return snappedRoom;
    
    // Skip the room we're currently checking
    const otherRooms = rooms.filter(r => r.id !== testRoom.id);
    
    let minDistanceX = Infinity;
    let minDistanceY = Infinity;
    
    for (const otherRoom of otherRooms) {
      // Check right edge of testRoom to left edge of otherRoom
      const rightToLeftDist = Math.abs((testRoom.x + testRoom.width) - otherRoom.x);
      if (rightToLeftDist <= snapThreshold && rightToLeftDist < minDistanceX) {
        minDistanceX = rightToLeftDist;
        snappedRoom.x = otherRoom.x - testRoom.width;
      }
      
      // Check left edge of testRoom to right edge of otherRoom
      const leftToRightDist = Math.abs(testRoom.x - (otherRoom.x + otherRoom.width));
      if (leftToRightDist <= snapThreshold && leftToRightDist < minDistanceX) {
        minDistanceX = leftToRightDist;
        snappedRoom.x = otherRoom.x + otherRoom.width;
      }
      
      // Check bottom edge of testRoom to top edge of otherRoom
      const bottomToTopDist = Math.abs((testRoom.y + testRoom.height) - otherRoom.y);
      if (bottomToTopDist <= snapThreshold && bottomToTopDist < minDistanceY) {
        minDistanceY = bottomToTopDist;
        snappedRoom.y = otherRoom.y - testRoom.height;
      }
      
      // Check top edge of testRoom to bottom edge of otherRoom
      const topToBottomDist = Math.abs(testRoom.y - (otherRoom.y + otherRoom.height));
      if (topToBottomDist <= snapThreshold && topToBottomDist < minDistanceY) {
        minDistanceY = topToBottomDist;
        snappedRoom.y = otherRoom.y + otherRoom.height;
      }
      
      // Check aligned edges (vertical alignment)
      if (Math.abs(testRoom.x - otherRoom.x) <= snapThreshold && Math.abs(testRoom.x - otherRoom.x) < minDistanceX) {
        minDistanceX = Math.abs(testRoom.x - otherRoom.x);
        snappedRoom.x = otherRoom.x;
      }
      
      if (Math.abs((testRoom.x + testRoom.width) - (otherRoom.x + otherRoom.width)) <= snapThreshold && 
          Math.abs((testRoom.x + testRoom.width) - (otherRoom.x + otherRoom.width)) < minDistanceX) {
        minDistanceX = Math.abs((testRoom.x + testRoom.width) - (otherRoom.x + otherRoom.width));
        snappedRoom.x = otherRoom.x + otherRoom.width - testRoom.width;
      }
      
      // Check aligned edges (horizontal alignment)
      if (Math.abs(testRoom.y - otherRoom.y) <= snapThreshold && Math.abs(testRoom.y - otherRoom.y) < minDistanceY) {
        minDistanceY = Math.abs(testRoom.y - otherRoom.y);
        snappedRoom.y = otherRoom.y;
      }
      
      if (Math.abs((testRoom.y + testRoom.height) - (otherRoom.y + otherRoom.height)) <= snapThreshold && 
          Math.abs((testRoom.y + testRoom.height) - (otherRoom.y + otherRoom.height)) < minDistanceY) {
        minDistanceY = Math.abs((testRoom.y + testRoom.height) - (otherRoom.y + otherRoom.height));
        snappedRoom.y = otherRoom.y + otherRoom.height - testRoom.height;
      }
    }
    
    return snappedRoom;
  };
  
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
      // Calculate the delta change since last mouse position
      const dx = (e.clientX - state.lastMouse.x) / state.scale;
      const dy = (e.clientY - state.lastMouse.y) / state.scale;
      
      const selectedRoom = rooms.find(room => room.id === selectedRoomId);
      if (!selectedRoom) return;
      
      // Move room directly with mouse movement - much smoother feel
      // Don't snap to grid during the drag for better experience
      let updatedRoom = {
        ...selectedRoom,
        x: selectedRoom.x + dx,
        y: selectedRoom.y + dy
      };
      
      // Update all rooms, replacing the one being moved
      const updatedRooms = rooms.map(room => 
        room.id === selectedRoomId ? updatedRoom : room
      );
      
      onRoomsChange(updatedRooms);
      
      // Always update the last mouse position
      setState(prev => ({
        ...prev,
        lastMouse: { x: e.clientX, y: e.clientY },
      }));
    } else if (state.isResizing && selectedRoomId && state.activeResizeHandle) {
      const selectedRoom = rooms.find(room => room.id === selectedRoomId);
      if (!selectedRoom) return;
      
      // Get the resized room with constraints applied
      const newRoom = getResizedRoom(selectedRoom, state.activeResizeHandle, { x, y });
      
      // Update all rooms, replacing the one being resized
      const updatedRooms = rooms.map(room => 
        room.id === selectedRoomId ? newRoom : room
      );
      
      onRoomsChange(updatedRooms);
    }
  };
  
  const handleCanvasMouseUp = () => {
    if (state.isDragging && selectedRoomId) {
      // Apply grid snapping and proximity checks on mouse up
      const selectedRoom = rooms.find(room => room.id === selectedRoomId);
      if (selectedRoom) {
        let snappedRoom = {
          ...selectedRoom, 
          x: snapToGrid(selectedRoom.x),
          y: snapToGrid(selectedRoom.y)
        };
        
        // Apply room proximity snapping
        snappedRoom = checkRoomProximity(snappedRoom);
        
        // Update the room with snapped position
        const updatedRooms = rooms.map(room => 
          room.id === selectedRoomId ? snappedRoom : room
        );
        
        onRoomsChange(updatedRooms);
      }
    }
    
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
      
      <TotalAreaDisplay rooms={rooms} />
      
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
              onUpdateRoom={onUpdateRoom}
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