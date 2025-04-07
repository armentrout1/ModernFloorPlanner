import React, { useState } from 'react';
import AppHeader from '@/components/AppHeader';
import Sidebar from '@/components/Sidebar';
import CanvasContainer from '@/components/CanvasContainer';
import PropertyPanel from '@/components/PropertyPanel';
import MaterialCalculationPanel from '@/components/MaterialCalculationPanel';
import SaveSketchModal from '@/components/SaveSketchModal';
import LoadSketchDialog from '@/components/LoadSketchDialog';
import { Room, ObjectType } from '@/utils/types';
import { SavedSketch } from '@/utils/api';
import { useToast } from '@/hooks/use-toast';
import { 
  autoAlignRooms, 
  distributeRooms, 
  mirrorRoom,
  centerRoomInViewport
} from '@/utils/canvas';

const FloorPlanner: React.FC = () => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<string>('room');
  const [placingObjectType, setPlacingObjectType] = useState<ObjectType | null>(null);
  const [currentSketchId, setCurrentSketchId] = useState<number | undefined>(undefined);
  const [currentSketchName, setCurrentSketchName] = useState<string>('');
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isLoadDialogOpen, setIsLoadDialogOpen] = useState(false);
  const [showMaterialPanel, setShowMaterialPanel] = useState(false);
  const { toast } = useToast();

  const handleNewSketch = () => {
    if (rooms.length === 0 || window.confirm('This will clear your current sketch. Continue?')) {
      setRooms([]);
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
      // Also switch to move tool for object placement
      setActiveTool('move');
    } else {
      setPlacingObjectType(null);
      setActiveTool(tool);
    }
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

  const selectedRoom = selectedRoomId 
    ? rooms.find(room => room.id === selectedRoomId) || null 
    : null;
    
  // Find selected object if any
  const selectedObject = selectedRoom && selectedObjectId && selectedRoom.objects 
    ? selectedRoom.objects.find(obj => obj.id === selectedObjectId) || null
    : null;

  return (
    <div className="bg-slate-50 text-slate-800 h-screen flex flex-col">
      <AppHeader 
        onNewSketch={handleNewSketch} 
        onSaveSketch={handleSaveClick}
        onLoadSketch={handleLoadClick}
        onToggleMaterialPanel={toggleMaterialPanel}
        showMaterialPanel={showMaterialPanel}
        canSave={rooms.length > 0}
      />
      
      <div className="flex flex-grow overflow-hidden">
        <Sidebar 
          activeTool={activeTool} 
          onSelectTool={handleSelectTool} 
          onApplyAction={handleApplyAction}
        />
        
        <CanvasContainer
          activeTool={activeTool}
          placingObjectType={placingObjectType}
          rooms={rooms}
          selectedRoomId={selectedRoomId}
          selectedObjectId={selectedObjectId}
          onRoomsChange={handleRoomsChange}
          onSelectRoom={handleSelectRoom}
          onSelectObject={handleSelectObject}
          onUpdateRoom={handleUpdateRoom}
        />
        
        {showMaterialPanel ? (
          <MaterialCalculationPanel
            rooms={rooms}
          />
        ) : (
          <PropertyPanel
            selectedRoom={selectedRoom}
            selectedObject={selectedObject}
            onUpdateRoom={handleUpdateRoom}
          />
        )}
      </div>

      {/* Save Sketch Modal */}
      <SaveSketchModal
        open={isSaveModalOpen}
        onOpenChange={setIsSaveModalOpen}
        rooms={rooms}
        currentSketchId={currentSketchId}
        currentSketchName={currentSketchName}
        onSave={handleSaveComplete}
      />

      {/* Load Sketch Dialog */}
      <LoadSketchDialog
        open={isLoadDialogOpen}
        onOpenChange={setIsLoadDialogOpen}
        onLoadSketch={handleLoadSketch}
      />
    </div>
  );
};

export default FloorPlanner;
