import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Room, Position, ResizeHandle, CanvasState, ObjectType, WallSide } from '@/utils/types';
import CanvasControls from './CanvasControls';
import RoomBox from './RoomBox';
import RoomObject from './RoomObject';
import TotalAreaDisplay from './TotalAreaDisplay';
import PreviewMode from './PreviewMode';
import { MoveHorizontal, MoveVertical, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  GRID_SIZE, 
  SCALE_FACTOR,
  ROOM_MIN_SIZE,
  snapToGrid, 
  createRoom, 
  getResizedRoom,
  detectWallClick,
  createRoomObject,
  centerRoomInViewport,
  inchesToPixels
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
  selectedRoomIds?: string[]; // New prop for multi-select
  onMultiSelectRooms?: (roomIds: string[]) => void; // New callback for multi-select
  onObjectPlaced?: () => void; // Callback when an object is placed
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
  onObjectPlaced,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  
  const [state, setState] = useState<CanvasState>({
    rooms: [],
    selectedRoomIds: [], // New array for multi-selection
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
    isSelecting: false, // For drag selection box
    selectStart: null,
    selectEnd: null,
    drawStart: null,
    drawEnd: null,
    lastMouse: { x: 0, y: 0 },
    activeResizeHandle: null,
    isPreviewMode: false, // For quick preview
  });

  // Enhanced door interaction state
  const [doorState, setDoorState] = useState<{
    mode: 'idle' | 'placing' | 'dragging';
    cursorPreview: { position: Position; targetWall: { roomId: string; wallSide: WallSide; position: number } | null } | null;
    draggedDoor: { objectId: string; object: any; sourceRoomId: string } | null;
    previewPosition: Position | null;
    targetWall: { roomId: string; wallSide: WallSide; position: number } | null;
  }>({
    mode: 'idle',
    cursorPreview: null,
    draggedDoor: null,
    previewPosition: null,
    targetWall: null,
  });
  
  // Zoom functions
  const handleZoomIn = useCallback(() => {
    setState(prev => ({
      ...prev,
      scale: prev.scale * SCALE_FACTOR,
    }));
  }, []);
  
  const handleZoomOut = useCallback(() => {
    setState(prev => ({
      ...prev,
      scale: prev.scale / SCALE_FACTOR,
    }));
  }, []);
  
  const handleResetZoom = useCallback(() => {
    setState(prev => ({
      ...prev,
      scale: 1,
    }));
    
    if (wrapperRef.current) {
      wrapperRef.current.scrollLeft = 0;
      wrapperRef.current.scrollTop = 0;
    }
  }, []);
  
  // Update local state when props change
  useEffect(() => {
    setState(prev => ({
      ...prev,
      rooms,
      selectedRoomId,
      selectedRoomIds: prev.selectedRoomIds, // Keep the multi-select state
      selectedObjectId,
      activeTool,
      placingObjectType,
    }));
    
    // Reset door state when tool changes away from door
    if (placingObjectType !== 'door' && doorState.mode !== 'dragging') {
      setDoorState({
        mode: 'idle',
        cursorPreview: null,
        draggedDoor: null,
        previewPosition: null,
        targetWall: null,
      });
    }
    
    // When door tool becomes active, ensure we're ready for placing
    if (placingObjectType === 'door' && doorState.mode === 'idle') {
      setDoorState(prev => ({
        ...prev,
        mode: 'idle', // Start in idle so doors can be picked up
      }));
    }
  }, [rooms, selectedRoomId, selectedObjectId, activeTool, placingObjectType]);
  
  // Add keyboard shortcuts for canvas controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        // Don't capture keyboard events when typing in form fields
        return;
      }

      if (e.key === 'Delete' && selectedRoomId) {
        // Delete the selected room
        const newRooms = rooms.filter(room => room.id !== selectedRoomId);
        onRoomsChange(newRooms);
        onSelectRoom(null);
      } else if (e.key === ' ' && !state.isPanning) {
        // Space bar - toggle panning mode
        setState(prev => ({ ...prev, isPanning: true }));
        
        if (canvasRef.current) {
          canvasRef.current.style.cursor = 'grab';
        }
      } else if (e.key === '+' || e.key === '=') {
        // Zoom in
        handleZoomIn();
      } else if (e.key === '-') {
        // Zoom out
        handleZoomOut();
      } else if (e.key === 'p' || e.key === 'P') {
        // Toggle preview mode
        setState(prev => ({ ...prev, isPreviewMode: !prev.isPreviewMode }));
      } else if (e.key === 'Escape' && state.isPreviewMode) {
        // Exit preview mode
        setState(prev => ({ ...prev, isPreviewMode: false }));
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        // Space bar released - exit panning mode
        setState(prev => ({ ...prev, isPanning: false }));
        
        if (canvasRef.current) {
          canvasRef.current.style.cursor = 'crosshair';
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [state.isPanning, state.isPreviewMode, selectedRoomId, onRoomsChange, onSelectRoom, rooms, handleZoomIn, handleZoomOut]);
  
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
  
  // Canvas event handlers
  // Handle object placement when clicking on a wall
  const handleWallClick = (roomId: string, position: Position) => {
    if (!placingObjectType) return;
    
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;
    
    // Detect which wall was clicked and at what position
    const wallDetection = detectWallClick(room, position, 25); // Larger detection threshold for easier door placement
    
    if (wallDetection) {
      const { wallSide, percentage } = wallDetection;
      
      // Create a new room object (door or window) at the exact click position
      const objectSize = placingObjectType === 'door' ? 40 : 30;
      const newObject = createRoomObject(placingObjectType, wallSide, percentage, objectSize);
      
      // Use the exact percentage from the click position
      newObject.position = percentage;
      
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
  // Enhanced wall detection for global dragging
  const findWallAtPosition = (x: number, y: number) => {
    const threshold = 20; // Distance threshold for wall detection
    
    for (const room of rooms) {
      const roomLeft = room.x;
      const roomRight = room.x + room.width;
      const roomTop = room.y;
      const roomBottom = room.y + room.height;
      
      // Check top wall
      if (Math.abs(y - roomTop) <= threshold && x >= roomLeft && x <= roomRight) {
        const position = ((x - roomLeft) / room.width) * 100;
        return { roomId: room.id, wallSide: 'top' as WallSide, position: Math.max(10, Math.min(90, position)) };
      }
      
      // Check bottom wall
      if (Math.abs(y - roomBottom) <= threshold && x >= roomLeft && x <= roomRight) {
        const position = ((x - roomLeft) / room.width) * 100;
        return { roomId: room.id, wallSide: 'bottom' as WallSide, position: Math.max(10, Math.min(90, position)) };
      }
      
      // Check left wall
      if (Math.abs(x - roomLeft) <= threshold && y >= roomTop && y <= roomBottom) {
        const position = ((y - roomTop) / room.height) * 100;
        return { roomId: room.id, wallSide: 'left' as WallSide, position: Math.max(10, Math.min(90, position)) };
      }
      
      // Check right wall
      if (Math.abs(x - roomRight) <= threshold && y >= roomTop && y <= roomBottom) {
        const position = ((y - roomTop) / room.height) * 100;
        return { roomId: room.id, wallSide: 'right' as WallSide, position: Math.max(10, Math.min(90, position)) };
      }
    }
    
    return null;
  };

  const handleObjectDragStart = (objectId: string, clientX: number, clientY: number) => {
    // Find the object and its source room
    let sourceRoom = null;
    let draggedObject = null;
    
    for (const room of rooms) {
      const obj = room.objects?.find(o => o.id === objectId);
      if (obj) {
        sourceRoom = room;
        draggedObject = obj;
        break;
      }
    }
    
    if (!sourceRoom || !draggedObject) return;
    
    // Only handle door dragging for now
    if (draggedObject.type === 'door') {
      // Enter door dragging mode
      setDoorState({
        mode: 'dragging',
        cursorPreview: null,
        draggedDoor: {
          objectId,
          object: draggedObject,
          sourceRoomId: sourceRoom.id,
        },
        previewPosition: null,
        targetWall: null,
      });
      
      setState(prev => ({
        ...prev,
        isDragging: true,
        lastMouse: { x: clientX, y: clientY },
      }));
    }
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
    if (e.button === 1 || (e.button === 0 && activeTool === 'move' && e.ctrlKey)) {
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
    } else if (activeTool === 'move' && e.button === 0) {
      // Start selection rectangle
      setState(prev => ({
        ...prev,
        isSelecting: true,
        selectStart: { x, y },
        selectEnd: { x, y },
        // Keep the current selection if Shift key is pressed, otherwise clear it
        selectedRoomIds: e.shiftKey ? prev.selectedRoomIds : [],
      }));
      
      // If not multi-selecting with shift, deselect current selection
      if (!e.shiftKey) {
        onSelectRoom(null);
        onSelectObject(null);
      }
    } else {
      // Deselect when clicking on empty canvas
      onSelectRoom(null);
      onSelectObject(null);
      setState(prev => ({
        ...prev,
        selectedRoomIds: [],
      }));
    }
  };
  
  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = (e.clientX - rect.left) / state.scale;
    const y = (e.clientY - rect.top) / state.scale;
    
    // Handle door cursor preview when door tool is active (but not when dragging)
    if (placingObjectType === 'door' && doorState.mode !== 'dragging') {
      const targetWall = findWallAtPosition(x, y);
      
      setDoorState(prev => ({
        ...prev,
        mode: 'placing',
        cursorPreview: {
          position: { x, y },
          targetWall,
        },
      }));
      
      return; // Early return to prevent other interactions
    }

    // Handle door dragging
    if (doorState.mode === 'dragging' && doorState.draggedDoor) {
      const targetWall = findWallAtPosition(x, y);
      
      setDoorState(prev => ({
        ...prev,
        previewPosition: { x, y },
        targetWall,
      }));
      
      return; // Early return to prevent other interactions during door drag
    }
    
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
    } else if (state.isSelecting && state.selectStart) {
      // Update selection rectangle
      setState(prev => ({
        ...prev,
        selectEnd: { x, y },
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
    // Handle door placement from cursor preview
    if (doorState.mode === 'placing' && doorState.cursorPreview?.targetWall && placingObjectType === 'door') {
      const { targetWall } = doorState.cursorPreview;
      const targetRoom = rooms.find(r => r.id === targetWall.roomId);
      
      if (targetRoom) {
        const newDoor = createRoomObject('door', targetWall.wallSide, targetWall.position, 40);
        
        const updatedRooms = rooms.map(room => 
          room.id === targetWall.roomId 
            ? { ...room, objects: [...(room.objects || []), newDoor] }
            : room
        );
        
        onRoomsChange(updatedRooms);
        onSelectObject(newDoor.id);
        
        // Reset door state to idle so the newly placed door can be immediately picked up
        setDoorState({
          mode: 'idle',
          cursorPreview: null,
          draggedDoor: null,
          previewPosition: null,
          targetWall: null,
        });
        
        // Notify parent that an object was placed so tool can be reset
        onObjectPlaced?.();
      }
      
      return; // Early return to prevent other actions
    }

    // Handle door drop from dragging
    if (doorState.mode === 'dragging' && doorState.draggedDoor) {
      const { draggedDoor } = doorState;
      
      // If there's a target wall, move the door there
      if (doorState.targetWall) {
        const { targetWall } = doorState;
        
        // Create updated rooms array
        const updatedRooms = rooms.map(room => {
          // Remove object from source room
          if (room.id === draggedDoor.sourceRoomId) {
            return {
              ...room,
              objects: room.objects?.filter(obj => obj.id !== draggedDoor.objectId) || []
            };
          }
          
          // Add object to target room
          if (room.id === targetWall.roomId) {
            const movedObject = {
              ...draggedDoor.object,
              wallSide: targetWall.wallSide,
              position: targetWall.position,
            };
            
            return {
              ...room,
              objects: [...(room.objects || []), movedObject]
            };
          }
          
          return room;
        });
        
        onRoomsChange(updatedRooms);
        onSelectObject(draggedDoor.objectId); // Keep door selected after move
      } else {
        // No valid target wall, door snaps back to original position
        // Door remains in its original location (no changes needed)
      }
      
      // Reset door state
      setDoorState({
        mode: 'idle',
        cursorPreview: null,
        draggedDoor: null,
        previewPosition: null,
        targetWall: null,
      });
    }
    
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
    
    if (state.isSelecting && state.selectStart && state.selectEnd) {
      // Process the selection rectangle to find rooms within it
      const { x: x1, y: y1 } = state.selectStart;
      const { x: x2, y: y2 } = state.selectEnd;
      
      const selectionBounds = {
        left: Math.min(x1, x2),
        top: Math.min(y1, y2),
        right: Math.max(x1, x2),
        bottom: Math.max(y1, y2)
      };
      
      // Find rooms inside the selection rectangle
      const selectedRoomIds: string[] = rooms
        .filter(room => {
          const roomBounds = {
            left: room.x,
            top: room.y,
            right: room.x + room.width,
            bottom: room.y + room.height
          };
          
          // Room is within selection if any part overlaps
          return !(
            roomBounds.right < selectionBounds.left ||
            roomBounds.left > selectionBounds.right ||
            roomBounds.bottom < selectionBounds.top ||
            roomBounds.top > selectionBounds.bottom
          );
        })
        .map(room => room.id);
      
      if (selectedRoomIds.length > 0) {
        // Set the primary selected room (for property panel)
        onSelectRoom(selectedRoomIds[0]);
        
        // Update selected room IDs - use concat and filter for uniqueness
        setState(prev => ({
          ...prev,
          selectedRoomIds: Array.from(
            new Set(prev.selectedRoomIds.concat(selectedRoomIds))
          )
        }));
        
        // For future expansion, we'll add multi-select support to the parent component
        // Currently we only use the local selectedRoomIds state
        // if (onMultiSelectRooms) {
        //   onMultiSelectRooms(selectedRoomIds);
        // }
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
      isSelecting: false,
      drawStart: null,
      drawEnd: null,
      selectStart: null,
      selectEnd: null,
      activeResizeHandle: null,
    }));
  };
  
  // Touch Handling
  const [touchDistance, setTouchDistance] = useState<number | null>(null);
  const [lastTouches, setLastTouches] = useState<React.Touch[]>([]);
  
  // Calculate distance between two touch points for pinch-to-zoom
  const getTouchDistance = (touches: React.TouchList): number => {
    if (touches.length < 2) return 0;
    
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };
  
  // Handle touch start on canvas
  const handleCanvasTouchStart = (e: React.TouchEvent) => {
    // Prevent default browser behavior like scrolling/zooming
    e.preventDefault();
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || e.touches.length === 0) return;
    
    const touch = e.touches[0];
    const x = (touch.clientX - rect.left) / state.scale;
    const y = (touch.clientY - rect.top) / state.scale;
    
    // Store touches for later reference
    if (e.touches.length > 0) {
      setLastTouches(Array.from(e.touches));
    }
    
    // Check if touch is on a room or on the canvas itself
    if (e.target !== canvasRef.current) {
      // Touch is likely on a room or other element - don't handle here
      return;
    }
    
    // Single touch - similar to mouse behavior
    if (e.touches.length === 1) {
      if (activeTool === 'room') {
        setState(prev => ({
          ...prev,
          isDrawing: true,
          drawStart: { x, y },
          drawEnd: { x, y },
        }));
      } else {
        // Default to panning with single finger when touching the canvas (not a room)
        setState(prev => ({
          ...prev,
          isPanning: true,
          lastMouse: { x: touch.clientX, y: touch.clientY },
        }));
        
        if (canvasRef.current) {
          canvasRef.current.style.cursor = 'grabbing';
        }
      }
    } 
    // Multi-touch - handle pinch zoom
    else if (e.touches.length === 2) {
      // Store initial distance for pinch detection
      const initialDistance = getTouchDistance(e.touches);
      setTouchDistance(initialDistance);
    }
  };
  
  // Handle touch move on canvas
  const handleCanvasTouchMove = (e: React.TouchEvent) => {
    // Prevent default browser behavior
    e.preventDefault();
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || e.touches.length === 0) return;
    
    // Handle single touch movement
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const x = (touch.clientX - rect.left) / state.scale;
      const y = (touch.clientY - rect.top) / state.scale;
      
      if (state.isPanning && wrapperRef.current) {
        // Calculate the delta change for panning
        const dx = touch.clientX - state.lastMouse.x;
        const dy = touch.clientY - state.lastMouse.y;
        
        // Pan by updating scroll position
        wrapperRef.current.scrollLeft -= dx;
        wrapperRef.current.scrollTop -= dy;
        
        // Update last touch position
        setState(prev => ({
          ...prev,
          lastMouse: { x: touch.clientX, y: touch.clientY },
        }));
      } else if (state.isDrawing && state.drawStart) {
        setState(prev => ({
          ...prev,
          drawEnd: { x, y },
        }));
      }
      
      // Store current touches for later reference
      setLastTouches(Array.from(e.touches));
    } 
    // Handle pinch gesture for zooming
    else if (e.touches.length === 2 && touchDistance !== null) {
      const currentDistance = getTouchDistance(e.touches);
      const delta = currentDistance - touchDistance;
      
      // Threshold to prevent tiny movements from triggering zoom
      if (Math.abs(delta) > 10) {
        if (delta > 0) {
          handleZoomIn();
        } else {
          handleZoomOut();
        }
        setTouchDistance(currentDistance);
      }
      
      // Store current touches
      setLastTouches(Array.from(e.touches));
    }
  };
  
  // Handle touch end on canvas
  const handleCanvasTouchEnd = (e: React.TouchEvent) => {
    // Don't prevent default here to allow normal touch behavior after the interaction
    
    if (state.isDrawing && state.drawStart && state.drawEnd) {
      // Similar to handleCanvasMouseUp for drawing
      // Calculate width and height
      const width = Math.abs(state.drawEnd.x - state.drawStart.x);
      const height = Math.abs(state.drawEnd.y - state.drawStart.y);
      
      // Only create a room if it's larger than the minimum size
      if (width >= ROOM_MIN_SIZE && height >= ROOM_MIN_SIZE) {
        const newRoom = createRoom(
          Math.min(state.drawStart.x, state.drawEnd.x),
          Math.min(state.drawStart.y, state.drawEnd.y),
          width,
          height
        );
        
        onRoomsChange([...rooms, newRoom]);
        onSelectRoom(newRoom.id);
      }
    }
    
    // Reset touch-specific states
    setTouchDistance(null);
    
    // Reset all interaction states
    setState(prev => ({ 
      ...prev, 
      isDrawing: false, 
      isPanning: false,
      isDragging: false,
      isResizing: false,
      isSelecting: false,
      drawStart: null, 
      drawEnd: null,
      selectStart: null,
      selectEnd: null,
      activeResizeHandle: null,
    }));
    
    // Reset cursor
    if (canvasRef.current) {
      canvasRef.current.style.cursor = 'crosshair';
    }
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
        
        {/* Preview Mode Toggle */}
        <Button
          variant={state.isPreviewMode ? "default" : "outline"}
          size="icon"
          className="h-8 w-8 rounded-full"
          onClick={() => setState(prev => ({ ...prev, isPreviewMode: !prev.isPreviewMode }))}
          title="Toggle Preview Mode"
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            className="h-4 w-4"
          >
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </Button>
        
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
          onTouchStart={handleCanvasTouchStart}
          onTouchMove={handleCanvasTouchMove}
          onTouchEnd={handleCanvasTouchEnd}
          onTouchCancel={handleCanvasTouchEnd}
        >
          {rooms.map(room => (
            <RoomBox
              key={room.id}
              room={room}
              isSelected={room.id === selectedRoomId}
              isPartOfMultiSelection={state.selectedRoomIds.includes(room.id) && room.id !== selectedRoomId}
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
          
          {/* Selection rectangle */}
          {state.isSelecting && state.selectStart && state.selectEnd && (
            <div
              className="absolute border border-blue-500 bg-blue-100/30 pointer-events-none"
              style={{
                left: `${Math.min(state.selectStart.x, state.selectEnd.x)}px`,
                top: `${Math.min(state.selectStart.y, state.selectEnd.y)}px`,
                width: `${Math.abs(state.selectEnd.x - state.selectStart.x)}px`,
                height: `${Math.abs(state.selectEnd.y - state.selectStart.y)}px`,
              }}
            />
          )}

          {/* Door cursor preview and drag preview */}
          {(doorState.mode === 'placing' || doorState.mode === 'dragging') && (
            <>
              {/* Cursor preview when placing doors */}
              {doorState.mode === 'placing' && doorState.cursorPreview?.targetWall && (
                (() => {
                  const { targetWall } = doorState.cursorPreview;
                  const targetRoom = rooms.find(r => r.id === targetWall.roomId);
                  if (!targetRoom) return null;

                  const doorSize = inchesToPixels(36); // Default 36" door

                  return (
                    <div key="door-cursor-preview">
                      {/* Door line preview */}
                      <div
                        className="absolute pointer-events-none"
                        style={{
                          backgroundColor: '#FF6B35',
                          opacity: 0.6,
                          zIndex: 50,
                          ...((() => {
                            const baseStyle: React.CSSProperties = {};
                            switch (targetWall.wallSide) {
                              case 'top':
                                baseStyle.left = `${targetRoom.x + (targetRoom.width * targetWall.position / 100) - doorSize / 2}px`;
                                baseStyle.top = `${targetRoom.y}px`;
                                baseStyle.width = `${doorSize}px`;
                                baseStyle.height = '6px';
                                break;
                              case 'right':
                                baseStyle.left = `${targetRoom.x + targetRoom.width - 6}px`;
                                baseStyle.top = `${targetRoom.y + (targetRoom.height * targetWall.position / 100) - doorSize / 2}px`;
                                baseStyle.width = '6px';
                                baseStyle.height = `${doorSize}px`;
                                break;
                              case 'bottom':
                                baseStyle.left = `${targetRoom.x + (targetRoom.width * targetWall.position / 100) - doorSize / 2}px`;
                                baseStyle.top = `${targetRoom.y + targetRoom.height - 6}px`;
                                baseStyle.width = `${doorSize}px`;
                                baseStyle.height = '6px';
                                break;
                              case 'left':
                                baseStyle.left = `${targetRoom.x}px`;
                                baseStyle.top = `${targetRoom.y + (targetRoom.height * targetWall.position / 100) - doorSize / 2}px`;
                                baseStyle.width = '6px';
                                baseStyle.height = `${doorSize}px`;
                                break;
                            }
                            return baseStyle;
                          })())
                        }}
                      />
                      
                      {/* Door swing arc preview */}
                      <svg
                        className="absolute pointer-events-none"
                        style={{
                          opacity: 0.4,
                          zIndex: 45,
                          ...((() => {
                            const svgStyle: React.CSSProperties = {
                              width: `${doorSize}px`,
                              height: `${doorSize}px`,
                            };
                            
                            switch (targetWall.wallSide) {
                              case 'top':
                                svgStyle.left = `${targetRoom.x + (targetRoom.width * targetWall.position / 100) - doorSize / 2}px`;
                                svgStyle.top = `${targetRoom.y + 6}px`;
                                break;
                              case 'right':
                                svgStyle.left = `${targetRoom.x + targetRoom.width - 6 - doorSize}px`;
                                svgStyle.top = `${targetRoom.y + (targetRoom.height * targetWall.position / 100) - doorSize / 2}px`;
                                break;
                              case 'bottom':
                                svgStyle.left = `${targetRoom.x + (targetRoom.width * targetWall.position / 100) - doorSize / 2}px`;
                                svgStyle.top = `${targetRoom.y + targetRoom.height - 6 - doorSize}px`;
                                break;
                              case 'left':
                                svgStyle.left = `${targetRoom.x + 6}px`;
                                svgStyle.top = `${targetRoom.y + (targetRoom.height * targetWall.position / 100) - doorSize / 2}px`;
                                break;
                            }
                            
                            return svgStyle;
                          })())
                        }}
                      >
                        <path
                          d={(() => {
                            // Create the proper door swing arc based on wall side
                            switch (targetWall.wallSide) {
                              case 'top':
                                // Door swings into room (downward)
                                return `M 0 0 L ${doorSize} 0 A ${doorSize} ${doorSize} 0 0 1 0 ${doorSize} Z`;
                              case 'right':
                                // Door swings into room (leftward)
                                return `M ${doorSize} 0 L ${doorSize} ${doorSize} A ${doorSize} ${doorSize} 0 0 1 0 0 Z`;
                              case 'bottom':
                                // Door swings into room (upward)
                                return `M ${doorSize} ${doorSize} L 0 ${doorSize} A ${doorSize} ${doorSize} 0 0 1 ${doorSize} 0 Z`;
                              case 'left':
                                // Door swings into room (rightward)
                                return `M 0 ${doorSize} L 0 0 A ${doorSize} ${doorSize} 0 0 1 ${doorSize} ${doorSize} Z`;
                              default:
                                return `M 0 0 L ${doorSize} 0 A ${doorSize} ${doorSize} 0 0 1 0 ${doorSize} Z`;
                            }
                          })()}
                          fill="none"
                          stroke="#FF6B35"
                          strokeWidth="1.5"
                          strokeDasharray="4,2"
                        />
                      </svg>
                    </div>
                  );
                })()
              )}

              {/* Wall highlighting during drag */}
              {doorState.mode === 'dragging' && (
                <>
                  {rooms.map(room => (
                    <div key={`wall-highlight-${room.id}`}>
                      {['top', 'right', 'bottom', 'left'].map(wallSide => (
                        <div
                          key={`${wallSide}-wall`}
                          className={`absolute pointer-events-none ${
                            doorState.targetWall?.roomId === room.id && doorState.targetWall?.wallSide === wallSide
                              ? 'bg-green-400 opacity-60'
                              : 'bg-gray-300 opacity-30'
                          }`}
                          style={{
                            ...((() => {
                              const wallStyle: React.CSSProperties = {};
                              switch (wallSide) {
                                case 'top':
                                  wallStyle.left = `${room.x}px`;
                                  wallStyle.top = `${room.y - 4}px`;
                                  wallStyle.width = `${room.width}px`;
                                  wallStyle.height = '8px';
                                  break;
                                case 'right':
                                  wallStyle.left = `${room.x + room.width - 4}px`;
                                  wallStyle.top = `${room.y}px`;
                                  wallStyle.width = '8px';
                                  wallStyle.height = `${room.height}px`;
                                  break;
                                case 'bottom':
                                  wallStyle.left = `${room.x}px`;
                                  wallStyle.top = `${room.y + room.height - 4}px`;
                                  wallStyle.width = `${room.width}px`;
                                  wallStyle.height = '8px';
                                  break;
                                case 'left':
                                  wallStyle.left = `${room.x - 4}px`;
                                  wallStyle.top = `${room.y}px`;
                                  wallStyle.width = '8px';
                                  wallStyle.height = `${room.height}px`;
                                  break;
                              }
                              return wallStyle;
                            })())
                          }}
                        />
                      ))}
                    </div>
                  ))}

                  {/* Dragged door preview */}
                  {doorState.targetWall && doorState.draggedDoor && (
                    (() => {
                      const { targetWall, draggedDoor } = doorState;
                      const targetRoom = rooms.find(r => r.id === targetWall.roomId);
                      if (!targetRoom) return null;

                      const doorSize = draggedDoor.object.doorProperties 
                        ? inchesToPixels(draggedDoor.object.doorProperties.width) 
                        : inchesToPixels(36);

                      let previewStyle: React.CSSProperties = {
                        position: 'absolute',
                        backgroundColor: '#FF6B35',
                        opacity: 0.7,
                        pointerEvents: 'none',
                        zIndex: 50,
                      };

                      switch (targetWall.wallSide) {
                        case 'top':
                          previewStyle.left = `${targetRoom.x + (targetRoom.width * targetWall.position / 100) - doorSize / 2}px`;
                          previewStyle.top = `${targetRoom.y}px`;
                          previewStyle.width = `${doorSize}px`;
                          previewStyle.height = '6px';
                          break;
                        case 'right':
                          previewStyle.left = `${targetRoom.x + targetRoom.width - 6}px`;
                          previewStyle.top = `${targetRoom.y + (targetRoom.height * targetWall.position / 100) - doorSize / 2}px`;
                          previewStyle.width = '6px';
                          previewStyle.height = `${doorSize}px`;
                          break;
                        case 'bottom':
                          previewStyle.left = `${targetRoom.x + (targetRoom.width * targetWall.position / 100) - doorSize / 2}px`;
                          previewStyle.top = `${targetRoom.y + targetRoom.height - 6}px`;
                          previewStyle.width = `${doorSize}px`;
                          previewStyle.height = '6px';
                          break;
                        case 'left':
                          previewStyle.left = `${targetRoom.x}px`;
                          previewStyle.top = `${targetRoom.y + (targetRoom.height * targetWall.position / 100) - doorSize / 2}px`;
                          previewStyle.width = '6px';
                          previewStyle.height = `${doorSize}px`;
                          break;
                      }

                      return <div key="dragged-door-preview" style={previewStyle} />;
                    })()
                  )}
                </>
              )}
            </>
          )}
          
          {/* Preview mode - simplified view of the floor plan */}
          {state.isPreviewMode && (
            <PreviewMode rooms={rooms} scale={state.scale} />
          )}
        </div>
      </div>
    </main>
  );
};

export default CanvasContainer;