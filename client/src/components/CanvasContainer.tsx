import React, { useRef, useEffect, useState } from 'react';
import { Room, Position, ResizeHandle, CanvasState, ObjectType, WallSide } from '@/utils/types';
import CanvasControls from './CanvasControls';
import RoomBox from './RoomBox';
import RoomObject from './RoomObject';
import TotalAreaDisplay from './TotalAreaDisplay';
import { MoveHorizontal, MoveVertical, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  GRID_SIZE, 
  SCALE_FACTOR, 
  snapToGrid, 
  createRoom, 
  getResizedRoom,
  detectWallClick,
  createRoomObject,
  centerRoomInViewport
} from '@/utils/canvas';

interface CanvasContainerProps {
  activeTool: string;
  placingObjectType: ObjectType | null;
  rooms: Room[];
  selectedRoomId: string | null;
  selectedObjectId: string | null;
  onRoomsChange: (rooms: Room[]) => void;
  onSelectRoom: (roomId: string | null) => void;
  onSelectObject: (objectId: string | null) => void;
  onUpdateRoom: (roomId: string, updates: Partial<Room>) => void;
}

const CanvasContainer: React.FC<CanvasContainerProps> = ({
  activeTool,
  placingObjectType,
  rooms,
  selectedRoomId,
  selectedObjectId,
  onRoomsChange,
  onSelectRoom,
  onSelectObject,
  onUpdateRoom,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  
  const [state, setState] = useState<CanvasState>({
    rooms: [],
    selectedRoomId: null,
    selectedObjectId: null,
    activeTool: activeTool,
    placingObjectType: placingObjectType,
    scale: 1,
    offset: { x: 0, y: 0 },
    isDragging: false,
    isResizing: false,
    isDrawing: false,
    isPanning: false,
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
      selectedObjectId,
      activeTool,
      placingObjectType,
    }));
  }, [rooms, selectedRoomId, selectedObjectId, activeTool, placingObjectType]);
  
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
  // Handle object placement when clicking on a wall
  const handleWallClick = (roomId: string, position: Position) => {
    if (!placingObjectType) return;
    
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;
    
    // Detect which wall was clicked and at what position
    const wallDetection = detectWallClick(room, position, 15); // Increased detection threshold for better usability
    
    if (wallDetection) {
      const { wallSide, percentage } = wallDetection;
      
      // Create a new room object (door or window)
      const objectSize = placingObjectType === 'door' ? 40 : 30;
      const newObject = createRoomObject(placingObjectType, wallSide, percentage, objectSize);
      
      // Check if position is at least 10% from the edges for better placement
      const adjustedPercentage = Math.max(10, Math.min(90, percentage));
      if (percentage !== adjustedPercentage) {
        newObject.position = adjustedPercentage;
      }
      
      // Update the room with the new object
      const currentObjects = room.objects || [];
      const updatedRoom = {
        ...room,
        objects: [...currentObjects, newObject]
      };
      
      // Update rooms
      onRoomsChange(
        rooms.map(r => (r.id === roomId ? updatedRoom : r))
      );
      
      // Select the newly created object
      onSelectObject(newObject.id);
    }
  };
  
  // Handler for selecting room objects
  const handleObjectSelect = (objectId: string) => {
    onSelectObject(objectId);
  };
  
  // Handler for starting object drag
  const handleObjectDragStart = (objectId: string, clientX: number, clientY: number) => {
    setState(prev => ({
      ...prev,
      isDragging: true,
      lastMouse: { x: clientX, y: clientY },
    }));
  };
  
  // Center the view on a particular room
  const handleCenterView = () => {
    if (!selectedRoomId || !wrapperRef.current) return;
    
    const selectedRoom = rooms.find(room => room.id === selectedRoomId);
    if (!selectedRoom) return;
    
    // Calculate the center position of the room
    const roomCenterX = selectedRoom.x + selectedRoom.width / 2;
    const roomCenterY = selectedRoom.y + selectedRoom.height / 2;
    
    // Calculate the center of the viewport
    const viewportWidth = wrapperRef.current.clientWidth;
    const viewportHeight = wrapperRef.current.clientHeight;
    
    // Set scroll position to center the room
    wrapperRef.current.scrollLeft = roomCenterX * state.scale - viewportWidth / 2;
    wrapperRef.current.scrollTop = roomCenterY * state.scale - viewportHeight / 2;
  };
  
  // Reset the view to fit all rooms
  const handleResetView = () => {
    if (!wrapperRef.current || rooms.length === 0) return;
    
    // Find the bounds of all rooms
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    
    rooms.forEach(room => {
      minX = Math.min(minX, room.x);
      minY = Math.min(minY, room.y);
      maxX = Math.max(maxX, room.x + room.width);
      maxY = Math.max(maxY, room.y + room.height);
    });
    
    // Add padding
    const padding = 100;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;
    
    // Get viewport dimensions
    const viewportWidth = wrapperRef.current.clientWidth;
    const viewportHeight = wrapperRef.current.clientHeight;
    
    // Calculate required scale to fit all rooms
    const scaleX = viewportWidth / (maxX - minX);
    const scaleY = viewportHeight / (maxY - minY);
    const newScale = Math.min(scaleX, scaleY, 1); // Don't zoom in more than 1x
    
    // Set new scale
    setState(prev => ({
      ...prev,
      scale: newScale,
    }));
    
    // Center the view
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    // Set scroll position after a short delay to allow scale change to apply
    setTimeout(() => {
      if (wrapperRef.current) {
        wrapperRef.current.scrollLeft = centerX * newScale - viewportWidth / 2;
        wrapperRef.current.scrollTop = centerY * newScale - viewportHeight / 2;
      }
    }, 10);
  };

  // Handle spacebar + click for panning
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.target !== canvasRef.current) return;
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = (e.clientX - rect.left) / state.scale;
    const y = (e.clientY - rect.top) / state.scale;
    
    // Middle mouse button or Spacebar + left click enables panning
    if (e.button === 1 || (e.button === 0 && activeTool === 'move')) {
      setState(prev => ({
        ...prev,
        isPanning: true,
        lastMouse: { x: e.clientX, y: e.clientY },
      }));
      
      // Change cursor to grabbing
      if (canvasRef.current) {
        canvasRef.current.style.cursor = 'grabbing';
      }
    } else if (activeTool === 'room') {
      setState(prev => ({
        ...prev,
        isDrawing: true,
        drawStart: { x, y },
        drawEnd: { x, y },
      }));
    } else {
      // Deselect when clicking on empty canvas
      onSelectRoom(null);
      onSelectObject(null);
    }
  };
  
  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = (e.clientX - rect.left) / state.scale;
    const y = (e.clientY - rect.top) / state.scale;
    
    if (state.isPanning && wrapperRef.current) {
      // Calculate the delta change since last mouse position for panning
      const dx = e.clientX - state.lastMouse.x;
      const dy = e.clientY - state.lastMouse.y;
      
      // Pan by updating scroll position
      wrapperRef.current.scrollLeft -= dx;
      wrapperRef.current.scrollTop -= dy;
      
      // Update last mouse position
      setState(prev => ({
        ...prev,
        lastMouse: { x: e.clientX, y: e.clientY },
      }));
    } else if (state.isDrawing && state.drawStart) {
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
    
    // Reset cursor if panning
    if (state.isPanning && canvasRef.current) {
      canvasRef.current.style.cursor = 'crosshair';
    }
    
    setState(prev => ({
      ...prev,
      isDrawing: false,
      isDragging: false,
      isResizing: false,
      isPanning: false,
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
      
      {/* Canvas Navigation Controls */}
      <div className="absolute left-1/2 bottom-4 -translate-x-1/2 flex items-center gap-2 z-10 bg-white/90 rounded-full shadow-md px-4 py-2 border border-slate-200">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 rounded-full"
          onClick={handleResetView}
          title="Fit All Rooms"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
        
        {selectedRoomId && (
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={handleCenterView}
            title="Center Selected Room"
          >
            <MoveHorizontal className="h-4 w-4" />
          </Button>
        )}
        
        <div className="text-xs bg-slate-100 px-2 py-1 rounded">
          {Math.round(state.scale * 100)}%
        </div>
      </div>
      
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
              onWallClick={handleWallClick}
              onObjectSelect={handleObjectSelect}
              onObjectDragStart={handleObjectDragStart}
              selectedObjectId={selectedObjectId}
              placingObjectType={placingObjectType}
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