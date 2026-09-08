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

import React, { useState, useEffect } from 'react';
import { deleteSelection, restoreDeletion, type DeletedItem } from '@/utils/editorCommands';
import { shouldIgnoreEditorShortcut } from '@/utils/keyboard';
import AppHeader from '@/components/AppHeader';
import Sidebar from '@/components/Sidebar';
import CanvasContainer from '@/components/CanvasContainer';
import PropertyPanel from '@/components/PropertyPanel';
import MaterialCalculationPanel from '@/components/MaterialCalculationPanel';
import SaveSketchModal from '@/components/SaveSketchModal';
import LoadSketchDialog from '@/components/LoadSketchDialog';
import KeyboardShortcutsDialog from '@/components/KeyboardShortcutsDialog';
import { ResizablePanels } from '@/components/ResizablePanels';
import PanelHeaderControls from '@/components/PanelHeaderControls';
import { Room, ObjectType } from '@/utils/types';
import { SavedSketch } from '@/utils/api';
import { useToast } from '@/hooks/use-toast';
import { 
  autoAlignRooms, 
  distributeRooms, 
  mirrorRoom,
  centerRoomInViewport
} from '@/utils/canvas';

const FloorPlanner: React.FC<{ active?: boolean }> = ({ active = true }) => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [deletions, setDeletions] = useState<DeletedItem[]>([]);
  const [roomSelectionId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  // An opening's current parent remains authoritative after a cross-room drag.
  const selectedRoomId = selectedObjectId
    ? rooms.find(room => room.objects?.some(object => object.id === selectedObjectId))?.id ?? null
    : roomSelectionId;
  const [activeTool, setActiveTool] = useState<string>('room');
  const [placingObjectType, setPlacingObjectType] = useState<ObjectType | null>(null);
  const [currentSketchId, setCurrentSketchId] = useState<number | undefined>(undefined);
  const [currentSketchName, setCurrentSketchName] = useState<string>('');
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isLoadDialogOpen, setIsLoadDialogOpen] = useState(false);
  const [showMaterialPanel, setShowMaterialPanel] = useState(false);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  const { toast } = useToast();

  const handleNewSketch = () => {
    if (rooms.length === 0 || window.confirm('This will clear your current sketch. Continue?')) {
      setRooms([]);
      setDeletions([]);
      setSelectedRoomId(null);
      setSelectedObjectId(null);
      setCurrentSketchId(undefined);
      setCurrentSketchName('');
    }
  };

  const handleSelectTool = (tool: string) => {
    // Clear selections when switching tools
    if (['door', 'window'].includes(tool)) {
      // When selecting door or window tool, set the placing object type
      setPlacingObjectType(tool as ObjectType);
      // Keep the tool active to show visual feedback
      setActiveTool(tool);
    } else {
      setPlacingObjectType(null);
      setActiveTool(tool);
    }
  };

  const handleObjectPlaced = () => {
    // Reset tool after object placement to prevent accidental multiple placements
    setPlacingObjectType(null);
    setActiveTool('select');
  };

  const handleApplyAction = (action: string) => {
    switch (action) {
      case 'auto-align':
        if (rooms.length > 1) {
          const alignedRooms = autoAlignRooms(rooms);
          setRooms(alignedRooms);
          toast({
            title: 'Rooms aligned',
            description: 'Rooms have been automatically aligned by their edges.',
          });
        } else {
          toast({
            title: 'Cannot align',
            description: 'Need at least two rooms to perform alignment.',
            variant: 'destructive'
          });
        }
        break;
        
      case 'distribute-horizontal':
        if (rooms.length > 2) {
          const distributedRooms = distributeRooms(rooms, 'horizontal');
          setRooms(distributedRooms);
          toast({
            title: 'Rooms distributed',
            description: 'Rooms have been distributed horizontally with even spacing.',
          });
        } else {
          toast({
            title: 'Cannot distribute',
            description: 'Need at least three rooms to distribute horizontally.',
            variant: 'destructive'
          });
        }
        break;
        
      case 'distribute-vertical':
        if (rooms.length > 2) {
          const distributedRooms = distributeRooms(rooms, 'vertical');
          setRooms(distributedRooms);
          toast({
            title: 'Rooms distributed',
            description: 'Rooms have been distributed vertically with even spacing.',
          });
        } else {
          toast({
            title: 'Cannot distribute',
            description: 'Need at least three rooms to distribute vertically.',
            variant: 'destructive'
          });
        }
        break;
        
      case 'mirror-horizontal':
        if (selectedRoomId) {
          const selectedRoom = rooms.find(r => r.id === selectedRoomId);
          if (selectedRoom) {
            const mirroredRoom = mirrorRoom(selectedRoom, 'horizontal');
            handleUpdateRoom(selectedRoomId, mirroredRoom);
            toast({
              title: 'Room mirrored',
              description: 'Room has been mirrored horizontally.',
            });
          }
        } else {
          toast({
            title: 'No room selected',
            description: 'Please select a room to mirror.',
            variant: 'destructive'
          });
        }
        break;
        
      case 'mirror-vertical':
        if (selectedRoomId) {
          const selectedRoom = rooms.find(r => r.id === selectedRoomId);
          if (selectedRoom) {
            const mirroredRoom = mirrorRoom(selectedRoom, 'vertical');
            handleUpdateRoom(selectedRoomId, mirroredRoom);
            toast({
              title: 'Room mirrored',
              description: 'Room has been mirrored vertically.',
            });
          }
        } else {
          toast({
            title: 'No room selected',
            description: 'Please select a room to mirror.',
            variant: 'destructive'
          });
        }
        break;
        
      case 'center-room':
        if (selectedRoomId) {
          const selectedRoom = rooms.find(r => r.id === selectedRoomId);
          if (selectedRoom) {
            // Use window dimensions instead of ref
            const width = window.innerWidth * 0.6; // Approximate canvas width
            const height = window.innerHeight * 0.8; // Approximate canvas height
            const centeredRoom = centerRoomInViewport(selectedRoom, width, height);
            handleUpdateRoom(selectedRoomId, centeredRoom);
            toast({
              title: 'Room centered',
              description: 'Room has been centered in the viewport.',
            });
          }
        } else {
          toast({
            title: 'No room selected',
            description: 'Please select a room to center.',
            variant: 'destructive'
          });
        }
        break;
    }
  };

  const handleRoomsChange = (updatedRooms: Room[]) => {
    setRooms(updatedRooms);
  };

  const handleSelectRoom = (roomId: string | null) => {
    setSelectedRoomId(roomId);
    setSelectedObjectId(null); // Clear object selection when selecting a room
  };
  
  const handleSelectObject = (objectId: string | null) => {
    setSelectedObjectId(objectId);
    const parent = rooms.find(room => room.objects?.some(object => object.id === objectId));
    if (parent) setSelectedRoomId(parent.id);
  };

  const handleUpdateRoom = (roomId: string, updates: Partial<Room>) => {
    setRooms(currentRooms => 
      currentRooms.map(room => 
        room.id === roomId 
          ? { ...room, ...updates }
          : room
      )
    );
  };

  const handleSaveClick = () => {
    setIsSaveModalOpen(true);
  };

  const handleLoadClick = () => {
    setIsLoadDialogOpen(true);
  };
  
  const toggleMaterialPanel = () => {
    setShowMaterialPanel(prev => !prev);
  };

  const handleSaveComplete = (savedSketch: SavedSketch) => {
    // Update the current sketch information
    setCurrentSketchId(savedSketch.id);
    setCurrentSketchName(savedSketch.name);
  };

  const handleLoadSketch = (sketch: SavedSketch) => {
    if (rooms.length && !window.confirm("Replace the current sketch? Save any changes you want to keep first.")) return;
    setDeletions([]);
    // Clear the current state
    setSelectedRoomId(null);
    setSelectedObjectId(null);
    
    // Load the new sketch data
    setRooms(sketch.rooms);
    setCurrentSketchId(sketch.id);
    setCurrentSketchName(sketch.name);
    
    toast({
      title: 'Sketch loaded',
      description: `"${sketch.name}" has been loaded successfully.`,
    });
  };
  
  const handleDeleteSelectedRoom = () => {
    const result = deleteSelection(rooms, selectedRoomId, selectedObjectId);
    if (!result) return;
    setRooms(result.rooms);
    setDeletions(previous => [...previous.slice(-19), result.deleted]);
    setSelectedObjectId(null);
    setSelectedRoomId(result.deleted.kind === 'room' ? null : result.deleted.roomId);
    toast({ title: result.deleted.kind === 'room' ? 'Room deleted' : 'Opening deleted',
      description: 'Use Undo delete to restore it during this sketch session.' });
  };

  const handleUndoDelete = () => {
    const deleted = deletions.at(-1);
    if (!deleted) return;
    const restored = restoreDeletion(rooms, deleted);
    if (!restored) return;
    setRooms(restored);
    setDeletions(previous => previous.slice(0, -1));
    setSelectedRoomId(deleted.kind === 'room' ? deleted.room.id : deleted.roomId);
    setSelectedObjectId(deleted.kind === 'opening' ? deleted.object.id : null);
  };

  // One owner for deletion prevents a second listener from deleting the parent room.
  useEffect(() => {
    if (!active) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreEditorShortcut(event) || isSaveModalOpen || isLoadDialogOpen || showKeyboardShortcuts) return;
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'z') {
        if (deletions.length) { event.preventDefault(); handleUndoDelete(); }
      } else if (!event.ctrlKey && !event.metaKey && !event.altKey &&
                 (event.key === 'Delete' || event.key === 'Backspace') && (selectedRoomId || selectedObjectId)) {
        event.preventDefault();
        handleDeleteSelectedRoom();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, rooms, deletions, selectedRoomId, selectedObjectId, isSaveModalOpen, isLoadDialogOpen, showKeyboardShortcuts]);

  const selectedRoom = (selectedObjectId
    ? rooms.find(room => room.objects?.some(object => object.id === selectedObjectId))
    : rooms.find(room => room.id === selectedRoomId)) ?? null;
    
  // Find selected object if any
  const selectedObject = selectedRoom && selectedObjectId && selectedRoom.objects 
    ? selectedRoom.objects.find(obj => obj.id === selectedObjectId) || null
    : null;

  // Add state for panel controls
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [leftPanelExpanded, setLeftPanelExpanded] = useState(false);
  const [rightPanelExpanded, setRightPanelExpanded] = useState(false);
  
  // Panel control handlers
  const handleToggleLeftPanel = (collapsed: boolean) => setLeftCollapsed(collapsed);
  const handleToggleRightPanel = (collapsed: boolean) => setRightCollapsed(collapsed);
  const handleExpandLeftPanel = () => setLeftPanelExpanded(!leftPanelExpanded);
  const handleExpandRightPanel = () => setRightPanelExpanded(!rightPanelExpanded);

  return (
    <div className="bg-slate-50 text-slate-800 h-screen flex flex-col">
      <AppHeader 
        onUndoDelete={handleUndoDelete}
        canUndoDelete={deletions.length > 0}
        onNewSketch={handleNewSketch} 
        onSaveSketch={handleSaveClick}
        onLoadSketch={handleLoadClick}
        onToggleMaterialPanel={toggleMaterialPanel}
        showMaterialPanel={showMaterialPanel}
        canSave={rooms.length > 0}
        onShowKeyboardShortcuts={() => setShowKeyboardShortcuts(true)}
      />
      
      {/* Panel controls header */}
      <PanelHeaderControls
        leftPanelTitle="Tools & Actions"
        rightPanelTitle={showMaterialPanel ? "Materials" : "Properties"}
        leftPanelExpanded={leftPanelExpanded}
        rightPanelExpanded={rightPanelExpanded}
        leftCollapsed={leftCollapsed}
        rightCollapsed={rightCollapsed}
        onToggleLeftPanel={handleToggleLeftPanel}
        onToggleRightPanel={handleToggleRightPanel}
        onExpandLeftPanel={handleExpandLeftPanel}
        onExpandRightPanel={handleExpandRightPanel}
      />
      
      <div className="min-h-0 flex-grow overflow-hidden">
        <ResizablePanels
          leftPanelWidth={leftPanelExpanded ? 70 : 20}
          rightPanelWidth={rightPanelExpanded ? 70 : 25}
          leftPanelTitle="Tools & Actions"
          rightPanelTitle={showMaterialPanel ? "Materials" : "Properties"}
          leftPanelMinSize={15}
          rightPanelMinSize={15}
          leftCollapsed={leftCollapsed}
          rightCollapsed={rightCollapsed}
          onLeftCollapsedChange={handleToggleLeftPanel}
          onRightCollapsedChange={handleToggleRightPanel}
          leftPanel={active ? (
            <div className="h-full">
              <Sidebar 
                activeTool={activeTool} 
                onSelectTool={handleSelectTool} 
                onApplyAction={handleApplyAction}
              />
            </div>
          ) : null}
          centerPanel={
            <CanvasContainer
              active={active}
              activeTool={activeTool}
              placingObjectType={placingObjectType}
              rooms={rooms}
              selectedRoomId={selectedRoom?.id ?? null}
              selectedObjectId={selectedObjectId}
              onRoomsChange={handleRoomsChange}
              onSelectRoom={handleSelectRoom}
              onSelectObject={handleSelectObject}
              onUpdateRoom={handleUpdateRoom}
              onObjectPlaced={handleObjectPlaced}
            />
          }
          rightPanel={active ? (
            <div className="h-full">
              {showMaterialPanel ? (
                <MaterialCalculationPanel
                  rooms={rooms}
                />
              ) : (
                <PropertyPanel
                  selectedRoom={selectedRoom}
                  selectedObject={selectedObject}
                  onUpdateRoom={handleUpdateRoom}
                  onDeleteRoom={handleDeleteSelectedRoom}
                />
              )}
            </div>
          ) : null}
        />
      </div>

      {/* Save Sketch Modal */}
      <SaveSketchModal
        open={active && isSaveModalOpen}
        onOpenChange={setIsSaveModalOpen}
        rooms={rooms}
        currentSketchId={currentSketchId}
        currentSketchName={currentSketchName}
        onSave={handleSaveComplete}
      />

      {/* Load Sketch Dialog */}
      <LoadSketchDialog
        open={active && isLoadDialogOpen}
        onOpenChange={setIsLoadDialogOpen}
        onLoadSketch={handleLoadSketch}
      />

      {/* Keyboard Shortcuts Dialog */}
      <KeyboardShortcutsDialog
        open={active && showKeyboardShortcuts}
        onOpenChange={setShowKeyboardShortcuts}
      />
    </div>
  );
};

export default FloorPlanner;
