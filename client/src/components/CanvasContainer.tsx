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

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Room, Position, ResizeHandle, CanvasState, ObjectType, WallSide } from '@/utils/types';
import { shouldIgnoreEditorShortcut } from '@/utils/keyboard';
import CanvasControls from './CanvasControls';
import { useCanvasView } from '@/hooks/useCanvasView';
import { useCanvasPan } from '@/hooks/useCanvasPan';
import { useCanvasZoom } from '@/hooks/useCanvasZoom';
import RoomBox from './RoomBox';
import RoomObject from './RoomObject';
import TotalAreaDisplay from './TotalAreaDisplay';
import PreviewMode from './PreviewMode';
import { MoveHorizontal, MoveVertical, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { expandRoomGroups, translateRooms, roomBounds } from '@/utils/roomSelection';
import { useToast } from '@/hooks/use-toast';
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
  active?: boolean;
  activeTool: string;
  placingObjectType: ObjectType | null;
  rooms: Room[];
  selectedRoomId: string | null;
  selectedObjectId: string | null;
  onRoomsChange: (rooms: Room[]) => void;
  onSelectRoom: (roomId: string | null, individual?: boolean) => void;
  onSelectObject: (objectId: string | null) => void;
  onUpdateRoom: (roomId: string, updates: Partial<Room>) => void;
  selectedRoomIds: string[];
  onMultiSelectRooms: (roomIds: string[]) => void;
  showRoomNames?: boolean;
  onObjectPlaced?: () => void; // Callback when an object is placed
}

const CanvasContainer: React.FC<CanvasContainerProps> = ({
  active = true,
  activeTool,
  placingObjectType,
  rooms,
  selectedRoomId,
  selectedObjectId,
  onRoomsChange,
  onSelectRoom,
  onSelectObject,
  onUpdateRoom,
  onObjectPlaced, selectedRoomIds, onMultiSelectRooms, showRoomNames = true,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const marqueeBase = useRef<string[]>([]);
  const roomDrag = useRef<{ ids: string[]; anchorId: string; rooms: Room[]; x: number; y: number; moved: boolean } | null>(null);
  
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
    isSelecting: false, // For drag selection box
    selectStart: null,
    selectEnd: null,
    drawStart: null,
    drawEnd: null,
    lastMouse: { x: 0, y: 0 },
    activeResizeHandle: null,
    isPreviewMode: false, // For quick preview
  });

  useEffect(() => {
    if (!selectedRoomId || !rooms.some(room => room.id === selectedRoomId)) {
      roomDrag.current = null;
      setState(previous => previous.isDragging ? { ...previous, isDragging: false } : previous);
    }
  }, [selectedRoomId, rooms]);

  useEffect(() => {
    const cancel = () => {
      roomDrag.current = null;
      setDoorState({ mode: 'idle', cursorPreview: null, draggedDoor: null, previewPosition: null, targetWall: null });
      setState(previous => ({ ...previous, isDrawing: false, isDragging: false, isSelecting: false, isResizing: false,
        selectStart: null, selectEnd: null }));
    };
    window.addEventListener('blur', cancel);
    return () => window.removeEventListener('blur', cancel);
  }, []);

  const view = useCanvasView(wrapperRef, rooms, state.scale);

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
  
  const pan = useCanvasPan(wrapperRef, active, activeTool === 'move',
    !state.isDrawing && !state.isDragging && !state.isResizing && !state.isSelecting && doorState.mode !== 'dragging',
    view.captureCenter);

  const zoom = useCanvasZoom(stageRef, canvasRef, wrapperRef, active, state.scale,
    (scale, center) => {
      setState(previous => ({ ...previous, scale }));
      view.centerOn(center);
    }, () => {
      roomDrag.current = null;
      setState(previous => ({ ...previous, isDrawing: false, isDragging: false,
        isResizing: false, isSelecting: false, isPanning: false, drawStart: null,
        drawEnd: null, selectStart: null, selectEnd: null, activeResizeHandle: null }));
      setDoorState({ mode: 'idle', cursorPreview: null, draggedDoor: null,
        previewPosition: null, targetWall: null });
    });

  // Zoom functions
  const handleZoomIn = useCallback(() => {
    view.captureCenter();
    setState(prev => ({
      ...prev,
      scale: prev.scale * SCALE_FACTOR,
    }));
  }, []);
  
  const handleZoomOut = useCallback(() => {
    view.captureCenter();
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
    
    view.centerOn({ x: view.viewport.width / 2, y: view.viewport.height / 2 });
  }, [view.centerOn, view.viewport.width, view.viewport.height]);
  
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
  
  // Add keyboard shortcuts only while the sketch route is active.
  useEffect(() => {
    if (!active) {
      roomDrag.current = null;
      // Cancel only unfinished gestures. Committed rooms, selection and zoom stay.
      setState(previous => ({ ...previous, isPanning: false, isDrawing: false,
        isDragging: false, isResizing: false, isSelecting: false, selectStart: null,
        selectEnd: null, drawStart: null, drawEnd: null, activeResizeHandle: null }));
      setDoorState({ mode: 'idle', cursorPreview: null, draggedDoor: null,
        previewPosition: null, targetWall: null });
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnoreEditorShortcut(e) || e.ctrlKey || e.metaKey || e.altKey) {
        // Don't capture keyboard events when typing in form fields
        return;
      }

      if (e.key === '+' || e.key === '=') {
        // Zoom in
        handleZoomIn();
      } else if (e.key === '-') {
        // Zoom out
        handleZoomOut();
      } else if (e.key === 'p' || e.key === 'P') {
        // Toggle preview mode
        setState(prev => ({ ...prev, isPreviewMode: !prev.isPreviewMode }));
      } else if (e.key === 'Escape') {
        roomDrag.current = null;
        setDoorState({ mode: 'idle', cursorPreview: null, draggedDoor: null, previewPosition: null, targetWall: null });
        setState(prev => ({ ...prev, isDragging: false, isSelecting: false, isResizing: false, isDrawing: false, selectStart: null, selectEnd: null }));
        // Exit preview mode
        setState(prev => ({ ...prev, isPreviewMode: false }));
      }
    };
    
    // Cancel the gesture before the parent's Escape deselection replaces this listener.
    window.addEventListener('keydown', handleKeyDown, true);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [active, state.isPanning, state.isPreviewMode, selectedRoomId, onRoomsChange, onSelectRoom, rooms, handleZoomIn, handleZoomOut]);
  
  // Check for rooms that are close to each other for snapping
  const checkRoomProximity = (testRoom: Room, excluded: string[] = [testRoom.id]): Room => {
    const snapThreshold = GRID_SIZE * 0.75; // Slightly less than 1 foot in pixels for better feel
    let snappedRoom = { ...testRoom };
    
    // Don't check proximity if this is the only room
    if (rooms.length <= 1) return snappedRoom;
    
    // Skip the room we're currently checking
    const otherRooms = rooms.filter(r => !excluded.includes(r.id));
    
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
  // Check if a wall location has conflicting objects
  const hasConflictingObjects = (roomId: string, wallSide: WallSide, position: number, objectType: ObjectType, excludeObjectId?: string): boolean => {
    const room = rooms.find(r => r.id === roomId);
    if (!room || !room.objects) return false;

    const objectSize = objectType === 'door' ? 40 : 48;
    const minPosition = position - (objectSize / 2) / (wallSide === 'top' || wallSide === 'bottom' ? room.width : room.height) * 100;
    const maxPosition = position + (objectSize / 2) / (wallSide === 'top' || wallSide === 'bottom' ? room.width : room.height) * 100;

    for (const obj of room.objects) {
      if (excludeObjectId && obj.id === excludeObjectId) continue;
      if (obj.wallSide !== wallSide) continue;

      const objSize = obj.type === 'door' ? 40 : 48;
      const objMinPos = obj.position - (objSize / 2) / (wallSide === 'top' || wallSide === 'bottom' ? room.width : room.height) * 100;
      const objMaxPos = obj.position + (objSize / 2) / (wallSide === 'top' || wallSide === 'bottom' ? room.width : room.height) * 100;

      // Check for overlap
      if (!(maxPosition < objMinPos || minPosition > objMaxPos)) {
        return true;
      }
    }
    return false;
  };

  // Check if placing a room would conflict with existing windows
  const wouldRoomPlacementConflictWithWindows = (newRoom: { id?: string; x: number; y: number; width: number; height: number }, candidates = rooms): boolean => {
    const tolerance = 10;
    
    for (const existingRoom of candidates) {
      if (existingRoom.id === newRoom.id) continue;
      if (!existingRoom.objects) continue;
      
      // Check if rooms would be adjacent
      const roomsAdjacent = (
        // New room touches existing room's right wall
        (Math.abs(newRoom.x - (existingRoom.x + existingRoom.width)) < tolerance &&
         newRoom.y < existingRoom.y + existingRoom.height + tolerance &&
         newRoom.y + newRoom.height > existingRoom.y - tolerance) ||
        
        // New room touches existing room's left wall  
        (Math.abs(newRoom.x + newRoom.width - existingRoom.x) < tolerance &&
         newRoom.y < existingRoom.y + existingRoom.height + tolerance &&
         newRoom.y + newRoom.height > existingRoom.y - tolerance) ||
        
        // New room touches existing room's bottom wall
        (Math.abs(newRoom.y - (existingRoom.y + existingRoom.height)) < tolerance &&
         newRoom.x < existingRoom.x + existingRoom.width + tolerance &&
         newRoom.x + newRoom.width > existingRoom.x - tolerance) ||
        
        // New room touches existing room's top wall
        (Math.abs(newRoom.y + newRoom.height - existingRoom.y) < tolerance &&
         newRoom.x < existingRoom.x + existingRoom.width + tolerance &&
         newRoom.x + newRoom.width > existingRoom.x - tolerance)
      );
      
      
      if (roomsAdjacent) {
        // Check if any windows would be on the shared wall
        for (const obj of existingRoom.objects) {
          if (obj.type === 'window') {
            // Calculate window world position
            let windowX: number, windowY: number;
            
            switch (obj.wallSide) {
              case 'top':
                windowX = existingRoom.x + (existingRoom.width * obj.position / 100);
                windowY = existingRoom.y;
                break;
              case 'bottom':
                windowX = existingRoom.x + (existingRoom.width * obj.position / 100);
                windowY = existingRoom.y + existingRoom.height;
                break;
              case 'left':
                windowX = existingRoom.x;
                windowY = existingRoom.y + (existingRoom.height * obj.position / 100);
                break;
              case 'right':
                windowX = existingRoom.x + existingRoom.width;
                windowY = existingRoom.y + (existingRoom.height * obj.position / 100);
                break;
            }
            
            // Check if window would be on the shared wall with new room
            const windowOnSharedWall = (
              (windowX >= newRoom.x - tolerance && windowX <= newRoom.x + newRoom.width + tolerance &&
               (Math.abs(windowY - newRoom.y) < tolerance || Math.abs(windowY - (newRoom.y + newRoom.height)) < tolerance)) ||
              (windowY >= newRoom.y - tolerance && windowY <= newRoom.y + newRoom.height + tolerance &&
               (Math.abs(windowX - newRoom.x) < tolerance || Math.abs(windowX - (newRoom.x + newRoom.width)) < tolerance))
            );
            
            if (windowOnSharedWall) {
              return true;
            }
          }
        }
      }
    }
    
    return false;
  };

  // Check if there's an adjoining room that would block placement (only for windows)
  const hasAdjoiningRoomConflict = (roomId: string, wallSide: WallSide, position: number, objectType: ObjectType): boolean => {
    // Doors are allowed on shared walls, only windows are blocked
    if (objectType === 'door') return false;
    
    const room = rooms.find(r => r.id === roomId);
    if (!room) return false;

    // Calculate the world position of the wall segment
    let wallX: number, wallY: number;
    
    switch (wallSide) {
      case 'top':
        wallX = room.x + (room.width * position / 100);
        wallY = room.y;
        break;
      case 'bottom':
        wallX = room.x + (room.width * position / 100);
        wallY = room.y + room.height;
        break;
      case 'left':
        wallX = room.x;
        wallY = room.y + (room.height * position / 100);
        break;
      case 'right':
        wallX = room.x + room.width;
        wallY = room.y + (room.height * position / 100);
        break;
    }

    // Check if there's a room directly adjacent to this wall position
    for (const otherRoom of rooms) {
      if (otherRoom.id === roomId) continue;

      const tolerance = 10;
      
      switch (wallSide) {
        case 'top':
          // Check if there's a room above
          if (Math.abs(otherRoom.y + otherRoom.height - wallY) < tolerance &&
              wallX >= otherRoom.x - tolerance && wallX <= otherRoom.x + otherRoom.width + tolerance) {
            return true;
          }
          break;
        case 'bottom':
          // Check if there's a room below
          if (Math.abs(otherRoom.y - wallY) < tolerance &&
              wallX >= otherRoom.x - tolerance && wallX <= otherRoom.x + otherRoom.width + tolerance) {
            return true;
          }
          break;
        case 'left':
          // Check if there's a room to the left
          if (Math.abs(otherRoom.x + otherRoom.width - wallX) < tolerance &&
              wallY >= otherRoom.y - tolerance && wallY <= otherRoom.y + otherRoom.height + tolerance) {
            return true;
          }
          break;
        case 'right':
          // Check if there's a room to the right
          if (Math.abs(otherRoom.x - wallX) < tolerance &&
              wallY >= otherRoom.y - tolerance && wallY <= otherRoom.y + otherRoom.height + tolerance) {
            return true;
          }
          break;
      }
    }
    return false;
  };

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
    
    // Handle door and window dragging
    if (draggedObject.type === 'door' || draggedObject.type === 'window') {
      // Enter door dragging mode (works for both doors and windows)
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
  
  // Center the view only; room positions and attached openings are unchanged.
  const handleCenterView = () => {
    const selectedRoom = rooms.find(room => room.id === selectedRoomId);
    if (selectedRoom) view.centerOn({ x: selectedRoom.x + selectedRoom.width / 2, y: selectedRoom.y + selectedRoom.height / 2 });
  };

  const handleResetView = () => {
    const wrapper = wrapperRef.current;
    if (!wrapper || rooms.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const room of rooms) {
      minX = Math.min(minX, room.x); minY = Math.min(minY, room.y);
      maxX = Math.max(maxX, room.x + room.width); maxY = Math.max(maxY, room.y + room.height);
    }
    // Keep room edges clear of the view controls, using actual visible pixels.
    const padding = 64;
    const availableWidth = Math.max(1, wrapper.clientWidth - padding * 2);
    const availableHeight = Math.max(1, wrapper.clientHeight - padding * 2);
    const scale = Math.min(availableWidth / (maxX - minX), availableHeight / (maxY - minY), 1);
    setState(previous => ({ ...previous, scale }));
    view.centerOn({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 });
  };

  // Editing only: mouse-pan gestures are captured before reaching this handler.
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || (e.target !== canvasRef.current && e.target !== stageRef.current)) return;
    
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
    } else if ((activeTool === 'move' || activeTool === 'select') && e.button === 0) {
      marqueeBase.current = e.shiftKey ? selectedRoomIds : [];
      // Start selection rectangle
      setState(prev => ({
        ...prev,
        isSelecting: true,
        selectStart: { x, y },
        selectEnd: { x, y },
        // Keep the current selection if Shift key is pressed, otherwise clear it
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

    }
  };
  
  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (pan.ownedButton.current !== null || zoom.touchOwned.current) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = (e.clientX - rect.left) / state.scale;
    const y = (e.clientY - rect.top) / state.scale;
    
    // Handle object cursor preview when door or window tool is active (but not when dragging)
    if ((placingObjectType === 'door' || placingObjectType === 'window') && doorState.mode !== 'dragging') {
      const targetWall = findWallAtPosition(x, y);
      
      // Validate placement location
      let validTargetWall = null;
      if (targetWall) {
        const hasConflict = hasConflictingObjects(targetWall.roomId, targetWall.wallSide, targetWall.position, placingObjectType);
        const hasRoomConflict = hasAdjoiningRoomConflict(targetWall.roomId, targetWall.wallSide, targetWall.position, placingObjectType);
        
        if (!hasConflict && !hasRoomConflict) {
          validTargetWall = targetWall;
        }
      }
      
      setDoorState(prev => ({
        ...prev,
        mode: 'placing',
        cursorPreview: {
          position: { x, y },
          targetWall: validTargetWall,
        },
      }));
      
      return; // Early return to prevent other interactions
    }

    // Handle door dragging
    if (doorState.mode === 'dragging' && doorState.draggedDoor) {
      const targetWall = findWallAtPosition(x, y);
      
      // Validate dragging target location
      let validTargetWall = null;
      if (targetWall) {
        const hasConflict = hasConflictingObjects(
          targetWall.roomId, 
          targetWall.wallSide, 
          targetWall.position, 
          doorState.draggedDoor.object.type,
          doorState.draggedDoor.objectId // Exclude the object being dragged
        );
        const hasRoomConflict = hasAdjoiningRoomConflict(targetWall.roomId, targetWall.wallSide, targetWall.position, doorState.draggedDoor.object.type);
        
        if (!hasConflict && !hasRoomConflict) {
          validTargetWall = targetWall;
        }
      }
      
      setDoorState(prev => ({
        ...prev,
        previewPosition: { x, y },
        targetWall: validTargetWall,
      }));
      
      return; // Early return to prevent other interactions during door drag
    }
    
    if (state.isSelecting && state.selectStart) {
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
    } else if (state.isDragging && roomDrag.current) {
      moveRoomSelection(e.clientX, e.clientY);
    } else if (state.isResizing && selectedRoomId && state.activeResizeHandle) {
      const selectedRoom = rooms.find(room => room.id === selectedRoomId);
      if (!selectedRoom) return;
      
      // Get the resized room with constraints applied
      const newRoom = getResizedRoom(selectedRoom, state.activeResizeHandle, { x, y });
      
      // Check if this resize would conflict with existing windows
      const wouldConflict = wouldRoomPlacementConflictWithWindows(newRoom);
      
      if (!wouldConflict) {
        // Update all rooms, replacing the one being resized
        const updatedRooms = rooms.map(room => 
          room.id === selectedRoomId ? newRoom : room
        );
        
        onRoomsChange(updatedRooms);
      }
      // If there's a conflict, don't allow the resize
    }
  };
  
  const handleCanvasMouseUp = (event?: React.MouseEvent) => {
    if (pan.ownedButton.current !== null || zoom.touchOwned.current || (event?.type === 'mouseup' && event.button !== 0)) return;
    if (event?.type === 'mouseleave' && doorState.mode === 'placing') {
      // Leaving a hover preview is not a placement click (including after a pan).
      setDoorState(previous => ({ ...previous, mode: 'idle', cursorPreview: null }));
      return;
    }
    // Handle object placement from cursor preview (doors and windows)
    if (doorState.mode === 'placing' && doorState.cursorPreview?.targetWall && (placingObjectType === 'door' || placingObjectType === 'window')) {
      const { targetWall } = doorState.cursorPreview;
      const targetRoom = rooms.find(r => r.id === targetWall.roomId);
      
      if (targetRoom) {
        const newObject = createRoomObject(
          placingObjectType, 
          targetWall.wallSide, 
          targetWall.position, 
          placingObjectType === 'door' ? 40 : 48
        );
        
        const updatedRooms = rooms.map(room => 
          room.id === targetWall.roomId 
            ? { ...room, objects: [...(room.objects || []), newObject] }
            : room
        );
        
        onRoomsChange(updatedRooms);
        onSelectObject(newObject.id);
        
        // Reset state to idle so the newly placed object can be immediately picked up
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

    // Handle door drop from dragging - CRITICAL FIX
    if (doorState.mode === 'dragging' && doorState.draggedDoor) {
      console.log('Door drop detected:', doorState.targetWall); // Debug log
      
      const { draggedDoor } = doorState;
      
      // If there's a target wall, move the door there
      if (doorState.targetWall) {
        const { targetWall } = doorState;
        console.log('Moving door to:', targetWall); // Debug log
        
        // Create updated rooms array
        const updatedRooms = rooms.map(room => {
          if (room.id === draggedDoor.sourceRoomId && room.id === targetWall.roomId) {
            // Same room - remove and add in one step
            const filteredObjects = room.objects?.filter(obj => obj.id !== draggedDoor.objectId) || [];
            const movedObject = {
              ...draggedDoor.object,
              wallSide: targetWall.wallSide,
              position: targetWall.position,
            };
            
            return {
              ...room,
              objects: [...filteredObjects, movedObject]
            };
          } else if (room.id === draggedDoor.sourceRoomId) {
            // Remove object from source room
            return {
              ...room,
              objects: room.objects?.filter(obj => obj.id !== draggedDoor.objectId) || []
            };
          } else if (room.id === targetWall.roomId) {
            // Add object to target room
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
        
        console.log('Updating rooms with moved door'); // Debug log
        onRoomsChange(updatedRooms);
        onSelectObject(draggedDoor.objectId);
      } else {
        // No valid target wall - restore object to its original position
        console.log('No valid target wall, keeping object in original position');
        
        // Make sure the object stays in its source room at its original position
        const updatedRooms = rooms.map(room => {
          if (room.id === draggedDoor.sourceRoomId) {
            // Ensure the object is still in the room (in case it was temporarily removed)
            const existingObjects = room.objects || [];
            const objectExists = existingObjects.some(obj => obj.id === draggedDoor.objectId);
            
            if (!objectExists) {
              // Add the object back to its original position
              return {
                ...room,
                objects: [...existingObjects, draggedDoor.object]
              };
            }
          }
          return room;
        });
        
        onRoomsChange(updatedRooms);
        onSelectObject(draggedDoor.objectId);
      }
      
      // Always reset door state after dragging
      setDoorState({
        mode: 'idle',
        cursorPreview: null,
        draggedDoor: null,
        previewPosition: null,
        targetWall: null,
      });
      
      // Reset canvas dragging state too
      setState(prev => ({
        ...prev,
        isDragging: false,
      }));
      
      return; // Early return to prevent other actions
    }
    
    if (state.isDragging && roomDrag.current) {
      const drag = roomDrag.current;
      if (drag.moved) {
        const anchor = rooms.find(room => room.id === drag.anchorId);
        if (anchor) {
          const snapped = checkRoomProximity({ ...anchor, x: snapToGrid(anchor.x), y: snapToGrid(anchor.y) }, drag.ids);
          const candidate = translateRooms(rooms, drag.ids, snapped.x - anchor.x, snapped.y - anchor.y);
          if (canMoveSelection(candidate, drag.ids)) onRoomsChange(candidate);
        }
      } else {
        // A click selects one room/group; a drag keeps the whole existing selection.
        onSelectRoom(drag.anchorId);
      }
      roomDrag.current = null;
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
      
      onMultiSelectRooms(expandRoomGroups(rooms, [...marqueeBase.current, ...selectedRoomIds]));
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
        
        // Check if this new room would conflict with existing windows
        const wouldConflict = wouldRoomPlacementConflictWithWindows(newRoom);
        console.log('Room creation conflict check:', wouldConflict, newRoom); // Debug log
        
        if (!wouldConflict) {
          onRoomsChange([...rooms, newRoom]);
          onSelectRoom(newRoom.id);
        } else {
          console.log('Room creation blocked due to window conflict'); // Debug log
        }
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
  
  // Single-touch editing; two-finger gestures are owned by useCanvasZoom.
  // Handle touch start on canvas
  const handleCanvasTouchStart = (e: React.TouchEvent) => {
    if (zoom.touchOwned.current) return;
    // Prevent default browser behavior like scrolling/zooming
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || e.touches.length === 0) return;
    
    const touch = e.touches[0];
    const x = (touch.clientX - rect.left) / state.scale;
    const y = (touch.clientY - rect.top) / state.scale;
    
    // Check if touch is on a room or on the canvas itself
    if (e.target !== canvasRef.current && e.target !== stageRef.current) {
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
  };
  
  // Handle touch move on canvas
  const handleCanvasTouchMove = (e: React.TouchEvent) => {
    if (zoom.touchOwned.current) return;
    // Prevent default browser behavior
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || e.touches.length === 0) return;
    
    // Handle single touch movement
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const x = (touch.clientX - rect.left) / state.scale;
      const y = (touch.clientY - rect.top) / state.scale;
      
      if (state.isDragging || state.isResizing) {
        handleCanvasMouseMove({ clientX: touch.clientX, clientY: touch.clientY } as React.MouseEvent);
      } else if (state.isPanning && wrapperRef.current) {
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
      
    }
  };
  
  // Handle touch end on canvas
  const handleCanvasTouchEnd = (e: React.TouchEvent) => {
    if (zoom.touchOwned.current) return;
    if (state.isDragging || state.isResizing) {
      handleCanvasMouseUp({} as React.MouseEvent);
      return;
    }
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
  
  const canMoveSelection = (candidate: Room[], ids: string[]) => {
    const moving = candidate.filter(room => ids.includes(room.id));
    const stationary = candidate.filter(room => !ids.includes(room.id));
    // Compare against the proposed layout, never a moving peer's old location.
    return !moving.some(room => wouldRoomPlacementConflictWithWindows(room, stationary)) &&
      !stationary.some(room => wouldRoomPlacementConflictWithWindows(room, moving));
  };

  const moveRoomSelection = (clientX: number, clientY: number) => {
    const drag = roomDrag.current;
    if (!drag) return;
    const dx = clientX - drag.x, dy = clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 3) return;
    const candidate = translateRooms(drag.rooms, drag.ids, dx / state.scale, dy / state.scale);
    if (canMoveSelection(candidate, drag.ids)) { drag.moved = true; onRoomsChange(candidate); }
  };

  const handleRoomSelect = (roomId: string, individual = false) => {
    onSelectRoom(roomId, individual);
  };

  const handleRoomMoveStart = (roomId: string, clientX: number, clientY: number, additive = false) => {
    const group = expandRoomGroups(rooms, [roomId]);
    if (additive) {
      const remove = group.every(id => selectedRoomIds.includes(id));
      onMultiSelectRooms(remove ? selectedRoomIds.filter(id => !group.includes(id)) : Array.from(new Set([...selectedRoomIds, ...group])));
      return;
    }
    const ids = selectedRoomIds.includes(roomId) ? expandRoomGroups(rooms, selectedRoomIds) : group;
    onMultiSelectRooms(ids);
    roomDrag.current = { ids, anchorId: roomId, rooms, x: clientX, y: clientY, moved: false };
    setState(prev => ({ ...prev, isDragging: true, lastMouse: { x: clientX, y: clientY } }));
  };

  const handleRoomResizeStart = (roomId: string, handle: ResizeHandle) => {
    setState(prev => ({
      ...prev,
      isResizing: true,
      activeResizeHandle: handle,
    }));
    onSelectRoom(roomId);
  };
  
  // Draw the grid once in screen space so its lines remain visible when zoomed out.
  const gridBackground = `
    linear-gradient(to right, rgba(209, 213, 219, 0.3) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(209, 213, 219, 0.3) 1px, transparent 1px)
  `;

  // The transparent drawing plane retains its original model/pointer coordinates.
  const canvasStyle: React.CSSProperties = {
    width: view.planeWidth,
    height: view.planeHeight,
    left: view.origin.x,
    top: view.origin.y,
    transformOrigin: '0 0',
    transform: `scale(${state.scale})`,
  };
  
  return (
    <main className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <CanvasControls
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetZoom={handleResetZoom}
        onFitToScreen={handleResetView}
        onTogglePanMode={pan.toggleHand}
        isPanMode={pan.ready || pan.dragging}
      />
      
      <div 
        ref={wrapperRef}
        data-testid="canvas-viewport"
        className="min-h-0 w-full flex-1 overflow-auto bg-white"
        style={{ overflowAnchor: 'none', touchAction: 'none' }}
      >
        <div
          ref={stageRef}
          className={`relative overflow-hidden bg-white cursor-crosshair ${pan.dragging ? '!cursor-grabbing [&_*]:!cursor-grabbing' : pan.ready ? '!cursor-grab [&_*]:!cursor-grab' : ''}`}
          onMouseDownCapture={pan.onMouseDownCapture}
          onClickCapture={pan.onClickCapture}
          onAuxClickCapture={pan.onAuxClickCapture}
          style={{ width: view.width, height: view.height,
            backgroundSize: `${GRID_SIZE * state.scale}px ${GRID_SIZE * state.scale}px`,
            backgroundPosition: `${view.origin.x}px ${view.origin.y}px`,
            backgroundImage: gridBackground }}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
          onTouchStart={handleCanvasTouchStart}
          onTouchMove={handleCanvasTouchMove}
          onTouchEnd={handleCanvasTouchEnd}
          onTouchCancel={() => {
            roomDrag.current = null;
            setDoorState({ mode: 'idle', cursorPreview: null, draggedDoor: null, previewPosition: null, targetWall: null });
            setState(previous => ({ ...previous, isDragging: false, isResizing: false, isDrawing: false, isPanning: false, isSelecting: false,
              drawStart: null, drawEnd: null, selectStart: null, selectEnd: null }));
          }}
        >
        <div ref={canvasRef} data-testid="canvas-surface" className="absolute cursor-crosshair" style={canvasStyle}>
          {rooms.map(room => (
            <RoomBox
              key={room.id}
              isCanvasPinching={zoom.pinching}
              room={room}
              isSelected={!selectedObjectId && selectedRoomIds.includes(room.id)}
              isPartOfMultiSelection={selectedRoomIds.length > 1 && selectedRoomIds.includes(room.id)}
              allowResize={selectedRoomIds.length === 1 && !selectedObjectId}
              showRoomNames={showRoomNames}
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
          
          {selectedRoomIds.length > 1 && (() => {
            const bounds = roomBounds(rooms.filter(room => selectedRoomIds.includes(room.id)));
            return bounds && <div data-testid="selection-bounds" className="absolute border-2 border-dashed border-blue-600 pointer-events-none z-20" style={{ left: bounds.x - 5 / state.scale, top: bounds.y - 5 / state.scale,
              width: bounds.width + 10 / state.scale, height: bounds.height + 10 / state.scale }} />;
          })()}
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

          {/* Object cursor preview and drag preview */}
          {(doorState.mode === 'placing' || doorState.mode === 'dragging') && (
            <>
              {/* Cursor preview when placing objects */}
              {doorState.mode === 'placing' && doorState.cursorPreview?.targetWall && (
                (() => {
                  const { targetWall } = doorState.cursorPreview;
                  const targetRoom = rooms.find(r => r.id === targetWall.roomId);
                  if (!targetRoom) return null;

                  const objectSize = placingObjectType === 'door' ? inchesToPixels(36) : 48;

                  return (
                    <div key="object-cursor-preview">
                      {/* Object line preview */}
                      <div
                        className="absolute pointer-events-none"
                        style={{
                          backgroundColor: doorState.cursorPreview?.targetWall ? 
                            (placingObjectType === 'door' ? '#FF6B35' : '#4A90E2') : 
                            '#FF4444', // Red for invalid placement
                          opacity: 0.6,
                          zIndex: 50,
                          ...((() => {
                            const baseStyle: React.CSSProperties = {};
                            switch (targetWall.wallSide) {
                              case 'top':
                                baseStyle.left = `${targetRoom.x + (targetRoom.width * targetWall.position / 100) - objectSize / 2}px`;
                                baseStyle.top = `${targetRoom.y}px`;
                                baseStyle.width = `${objectSize}px`;
                                baseStyle.height = '6px';
                                break;
                              case 'right':
                                baseStyle.left = `${targetRoom.x + targetRoom.width - 6}px`;
                                baseStyle.top = `${targetRoom.y + (targetRoom.height * targetWall.position / 100) - objectSize / 2}px`;
                                baseStyle.width = '6px';
                                baseStyle.height = `${objectSize}px`;
                                break;
                              case 'bottom':
                                baseStyle.left = `${targetRoom.x + (targetRoom.width * targetWall.position / 100) - objectSize / 2}px`;
                                baseStyle.top = `${targetRoom.y + targetRoom.height - 6}px`;
                                baseStyle.width = `${objectSize}px`;
                                baseStyle.height = '6px';
                                break;
                              case 'left':
                                baseStyle.left = `${targetRoom.x}px`;
                                baseStyle.top = `${targetRoom.y + (targetRoom.height * targetWall.position / 100) - objectSize / 2}px`;
                                baseStyle.width = '6px';
                                baseStyle.height = `${objectSize}px`;
                                break;
                            }
                            return baseStyle;
                          })())
                        }}
                      />
                      
                      {/* Object swing arc preview (only for doors) */}
                      {placingObjectType === 'door' && (
                        <svg
                          className="absolute pointer-events-none"
                          style={{
                            opacity: 0.4,
                            zIndex: 45,
                            ...((() => {
                              const svgStyle: React.CSSProperties = {
                                width: `${objectSize}px`,
                                height: `${objectSize}px`,
                              };
                              
                              switch (targetWall.wallSide) {
                                case 'top':
                                  svgStyle.left = `${targetRoom.x + (targetRoom.width * targetWall.position / 100) - objectSize / 2}px`;
                                  svgStyle.top = `${targetRoom.y + 6}px`;
                                  break;
                                case 'right':
                                  svgStyle.left = `${targetRoom.x + targetRoom.width - 6 - objectSize}px`;
                                  svgStyle.top = `${targetRoom.y + (targetRoom.height * targetWall.position / 100) - objectSize / 2}px`;
                                  break;
                                case 'bottom':
                                  svgStyle.left = `${targetRoom.x + (targetRoom.width * targetWall.position / 100) - objectSize / 2}px`;
                                  svgStyle.top = `${targetRoom.y + targetRoom.height - 6 - objectSize}px`;
                                  break;
                                case 'left':
                                  svgStyle.left = `${targetRoom.x + 6}px`;
                                  svgStyle.top = `${targetRoom.y + (targetRoom.height * targetWall.position / 100) - objectSize / 2}px`;
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
                                  return `M 0 0 L ${objectSize} 0 A ${objectSize} ${objectSize} 0 0 1 0 ${objectSize} Z`;
                                case 'right':
                                  return `M ${objectSize} 0 L ${objectSize} ${objectSize} A ${objectSize} ${objectSize} 0 0 1 0 0 Z`;
                                case 'bottom':
                                  return `M ${objectSize} ${objectSize} L 0 ${objectSize} A ${objectSize} ${objectSize} 0 0 1 ${objectSize} 0 Z`;
                                case 'left':
                                  return `M 0 ${objectSize} L 0 0 A ${objectSize} ${objectSize} 0 0 1 ${objectSize} ${objectSize} Z`;
                                default:
                                  return `M 0 0 L ${objectSize} 0 A ${objectSize} ${objectSize} 0 0 1 0 ${objectSize} Z`;
                              }
                            })()}
                            fill="none"
                            stroke="#FF6B35"
                            strokeWidth="1.5"
                            strokeDasharray="4,2"
                          />
                        </svg>
                      )}
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
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-slate-200 bg-white p-2 sm:justify-between">
        <TotalAreaDisplay rooms={rooms} />
        {/* Canvas Navigation Controls */}
        <div data-testid="canvas-view-controls" className="flex flex-wrap items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 whitespace-nowrap"
            onClick={handleResetView}
            title="Fit All Rooms"
            aria-label="Fit All Rooms"
          >
            <RotateCcw className="mr-1.5 h-4 w-4" />Fit drawing
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

      </div>
    </main>
  );
};

export default CanvasContainer;