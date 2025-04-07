import React from 'react';
import { Room, RoomObject as RoomObjectType } from '@/utils/types';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DoorOpenIcon, Square as WindowIcon, Trash2 } from 'lucide-react';
import { 
  calculateRoomArea, 
  pixelsToFeet, 
  feetToFeetAndInches, 
  formatArea 
} from '@/utils/canvas';

interface PropertyPanelProps {
  selectedRoom: Room | null;
  selectedObject: RoomObjectType | null;
  onUpdateRoom: (roomId: string, updates: Partial<Room>) => void;
}

const PropertyPanel: React.FC<PropertyPanelProps> = ({
  selectedRoom,
  selectedObject,
  onUpdateRoom
}) => {
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (selectedRoom) {
      onUpdateRoom(selectedRoom.id, { name: e.target.value });
    }
  };
  
  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (selectedRoom) {
      onUpdateRoom(selectedRoom.id, { color: e.target.value });
    }
  };
  
  const handleDeleteObject = () => {
    if (selectedRoom && selectedObject && selectedRoom.objects) {
      // Filter out the selected object
      const updatedObjects = selectedRoom.objects.filter(obj => obj.id !== selectedObject.id);
      
      // Update the room
      onUpdateRoom(selectedRoom.id, { objects: updatedObjects });
    }
  };
  
  // If no room is selected, show an empty panel with a message
  if (!selectedRoom) {
    return (
      <div className="w-64 bg-slate-50 border-l border-slate-200 flex flex-col overflow-y-auto">
        <div className="p-4 border-b border-slate-200">
          <h2 className="text-lg font-medium">Properties</h2>
        </div>
        <div className="p-4 text-center text-slate-500">
          Select a room to edit its properties
        </div>
      </div>
    );
  }
  
  // Calculate room dimensions in feet
  const widthFeet = pixelsToFeet(selectedRoom.width);
  const heightFeet = pixelsToFeet(selectedRoom.height);
  const area = calculateRoomArea(selectedRoom);
  
  return (
    <div className="w-64 bg-slate-50 border-l border-slate-200 flex flex-col overflow-y-auto">
      <div className="p-4 border-b border-slate-200">
        <h2 className="text-lg font-medium">Properties</h2>
      </div>
      
      {selectedObject ? (
        // Object properties section
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {selectedObject.type === 'door' ? (
                <DoorOpenIcon className="h-5 w-5 text-orange-500" />
              ) : (
                <WindowIcon className="h-5 w-5 text-blue-500" />
              )}
              <span className="font-medium capitalize">{selectedObject.type}</span>
            </div>
            <Button 
              variant="outline" 
              size="icon" 
              className="h-7 w-7" 
              onClick={handleDeleteObject}
            >
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          </div>
          
          <div className="space-y-2">
            <Label>Wall</Label>
            <div className="text-sm p-2 bg-slate-100 rounded">
              {selectedObject.wallSide.charAt(0).toUpperCase() + selectedObject.wallSide.slice(1)} wall
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Position</Label>
            <div className="text-sm p-2 bg-slate-100 rounded">
              {Math.round(selectedObject.position)}% along wall
            </div>
          </div>
          
          <div className="text-xs text-slate-500 mt-4">
            Note: To adjust the position, drag the {selectedObject.type} along the wall.
          </div>
        </div>
      ) : (
        // Room properties section
        <div className="p-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="roomName">Name</Label>
            <Input 
              id="roomName" 
              value={selectedRoom.name || ''} 
              onChange={handleNameChange} 
              placeholder="Room name"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="roomColor">Color</Label>
            <div className="flex items-center space-x-2">
              <div 
                className="w-6 h-6 rounded-full border border-slate-300"
                style={{ backgroundColor: selectedRoom.color }}
              />
              <Input 
                id="roomColor" 
                type="color" 
                value={selectedRoom.color || '#93c5fd'} 
                onChange={handleColorChange}
                className="w-full h-8" 
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Dimensions</Label>
            <div className="grid grid-cols-2 gap-2">
              <div className="text-sm p-2 bg-slate-100 rounded">
                Width: {feetToFeetAndInches(widthFeet)}
              </div>
              <div className="text-sm p-2 bg-slate-100 rounded">
                Length: {feetToFeetAndInches(heightFeet)}
              </div>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Area</Label>
            <div className="text-sm p-2 bg-slate-100 rounded">
              {formatArea(area)}
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Room Objects</Label>
            <div className="flex flex-wrap gap-2">
              {selectedRoom.objects?.length ? (
                <div className="w-full grid grid-cols-2 gap-2">
                  <div className="text-sm p-2 bg-slate-100 rounded flex items-center">
                    <DoorOpenIcon className="h-4 w-4 mr-1 text-orange-500" />
                    <span>{selectedRoom.objects.filter(obj => obj.type === 'door').length || 0} Doors</span>
                  </div>
                  <div className="text-sm p-2 bg-slate-100 rounded flex items-center">
                    <WindowIcon className="h-4 w-4 mr-1 text-blue-500" />
                    <span>{selectedRoom.objects.filter(obj => obj.type === 'window').length || 0} Windows</span>
                  </div>
                </div>
              ) : (
                <div className="text-sm p-2 bg-slate-100 rounded w-full">
                  No objects added
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PropertyPanel;