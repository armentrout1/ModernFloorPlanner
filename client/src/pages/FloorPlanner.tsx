import React, { useState } from 'react';
import AppHeader from '@/components/AppHeader';
import Sidebar from '@/components/Sidebar';
import CanvasContainer from '@/components/CanvasContainer';
import PropertyPanel from '@/components/PropertyPanel';
import { Room } from '@/utils/types';

const FloorPlanner: React.FC = () => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<string>('room');

  const handleNewSketch = () => {
    if (rooms.length === 0 || window.confirm('This will clear your current sketch. Continue?')) {
      setRooms([]);
      setSelectedRoomId(null);
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

  const selectedRoom = selectedRoomId 
    ? rooms.find(room => room.id === selectedRoomId) || null 
    : null;

  return (
    <div className="bg-slate-50 text-slate-800 h-screen flex flex-col">
      <AppHeader onNewSketch={handleNewSketch} />
      
      <div className="flex flex-grow overflow-hidden">
        <Sidebar activeTool={activeTool} onSelectTool={handleSelectTool} />
        
        <CanvasContainer
          activeTool={activeTool}
          rooms={rooms}
          selectedRoomId={selectedRoomId}
          onRoomsChange={handleRoomsChange}
          onSelectRoom={handleSelectRoom}
        />
        
        <PropertyPanel
          selectedRoom={selectedRoom}
          onUpdateRoom={handleUpdateRoom}
        />
      </div>
    </div>
  );
};

export default FloorPlanner;
