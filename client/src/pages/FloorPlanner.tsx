import React, { useState } from 'react';
import AppHeader from '@/components/AppHeader';
import Sidebar from '@/components/Sidebar';
import CanvasContainer from '@/components/CanvasContainer';
import PropertyPanel from '@/components/PropertyPanel';
import SaveSketchModal from '@/components/SaveSketchModal';
import LoadSketchDialog from '@/components/LoadSketchDialog';
import { Room } from '@/utils/types';
import { SavedSketch } from '@/utils/api';
import { useToast } from '@/hooks/use-toast';

const FloorPlanner: React.FC = () => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<string>('room');
  const [currentSketchId, setCurrentSketchId] = useState<number | undefined>(undefined);
  const [currentSketchName, setCurrentSketchName] = useState<string>('');
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isLoadDialogOpen, setIsLoadDialogOpen] = useState(false);
  const { toast } = useToast();

  const handleNewSketch = () => {
    if (rooms.length === 0 || window.confirm('This will clear your current sketch. Continue?')) {
      setRooms([]);
      setSelectedRoomId(null);
      setCurrentSketchId(undefined);
      setCurrentSketchName('');
    }
  };

  const handleSelectTool = (tool: string) => {
    setActiveTool(tool);
  };

  const handleRoomsChange = (updatedRooms: Room[]) => {
    setRooms(updatedRooms);
  };

  const handleSelectRoom = (roomId: string | null) => {
    setSelectedRoomId(roomId);
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

  const handleSaveComplete = (savedSketch: SavedSketch) => {
    // Update the current sketch information
    setCurrentSketchId(savedSketch.id);
    setCurrentSketchName(savedSketch.name);
  };

  const handleLoadSketch = (sketch: SavedSketch) => {
    // Clear the current state
    setSelectedRoomId(null);
    
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

  return (
    <div className="bg-slate-50 text-slate-800 h-screen flex flex-col">
      <AppHeader 
        onNewSketch={handleNewSketch} 
        onSaveSketch={handleSaveClick}
        onLoadSketch={handleLoadClick}
        canSave={rooms.length > 0}
      />
      
      <div className="flex flex-grow overflow-hidden">
        <Sidebar activeTool={activeTool} onSelectTool={handleSelectTool} />
        
        <CanvasContainer
          activeTool={activeTool}
          rooms={rooms}
          selectedRoomId={selectedRoomId}
          onRoomsChange={handleRoomsChange}
          onSelectRoom={handleSelectRoom}
          onUpdateRoom={handleUpdateRoom}
        />
        
        <PropertyPanel
          selectedRoom={selectedRoom}
          onUpdateRoom={handleUpdateRoom}
        />
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
