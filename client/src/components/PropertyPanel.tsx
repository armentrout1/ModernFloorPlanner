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

import React from 'react';
import { Room, RoomObject as RoomObjectType, DoorStyle, SwingDirection, SwingSide } from '@/utils/types';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { DoorOpenIcon, Square as WindowIcon, Trash2 } from 'lucide-react';
import { getStandardDoorSizes, inchesToPixels, pixelsToInches } from '@/utils/canvas';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { 
  calculateRoomArea, 
  pixelsToFeet, 
  feetToFeetAndInches, 
  formatArea 
} from '@/utils/canvas';
import { calculateRoomPerimeter } from '@/utils/materialCalculator';

interface PropertyPanelProps {
  selectedRoom: Room | null;
  selectedObject: RoomObjectType | null;
  onUpdateRoom: (roomId: string, updates: Partial<Room>) => void;
  onDeleteRoom?: () => void;
}

const PropertyPanel: React.FC<PropertyPanelProps> = ({
  selectedRoom,
  selectedObject,
  onUpdateRoom,
  onDeleteRoom
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

  const handleDoorPropertyChange = (property: keyof NonNullable<RoomObjectType['doorProperties']>, value: any) => {
    if (selectedRoom && selectedObject && selectedObject.type === 'door' && selectedRoom.objects) {
      const updatedObjects = selectedRoom.objects.map(obj => {
        if (obj.id === selectedObject.id) {
          return {
            ...obj,
            doorProperties: {
              ...obj.doorProperties!,
              [property]: value,
            },
          };
        }
        return obj;
      });
      
      onUpdateRoom(selectedRoom.id, { objects: updatedObjects });
    }
  };

  const handleDoorSizeChange = (width: number) => {
    if (selectedRoom && selectedObject && selectedObject.type === 'door' && selectedRoom.objects) {
      const updatedObjects = selectedRoom.objects.map(obj => {
        if (obj.id === selectedObject.id) {
          return {
            ...obj,
            size: inchesToPixels(width), // Update the size property too
            doorProperties: {
              ...obj.doorProperties!,
              width,
            },
          };
        }
        return obj;
      });
      
      onUpdateRoom(selectedRoom.id, { objects: updatedObjects });
    }
  };
  
  // Calculate room dimensions in feet if a room is selected
  const widthFeet = selectedRoom ? pixelsToFeet(selectedRoom.width) : 0;
  const heightFeet = selectedRoom ? pixelsToFeet(selectedRoom.height) : 0;
  const area = selectedRoom ? calculateRoomArea(selectedRoom) : 0;
  const perimeter = selectedRoom ? calculateRoomPerimeter(selectedRoom) : 0;
  
  return (
    <div className="flex flex-col overflow-y-auto h-full">
      <div className="p-4 border-b border-slate-200">
        <h2 className="text-lg font-medium">Properties</h2>
      </div>
      
      {!selectedRoom ? (
        // No room selected
        <div className="p-4 flex-grow flex items-center justify-center">
          <div className="text-center text-slate-500 p-4">
            <p>Select a room to edit its properties</p>
          </div>
        </div>
      ) : selectedObject ? (
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

          {/* Door-specific properties */}
          {selectedObject.type === 'door' && selectedObject.doorProperties && (
            <>
              <div className="space-y-2">
                <Label>Door Style</Label>
                <Select
                  value={selectedObject.doorProperties.style}
                  onValueChange={(value: DoorStyle) => handleDoorPropertyChange('style', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Single Door</SelectItem>
                    <SelectItem value="double">Double Door</SelectItem>
                    <SelectItem value="sliding">Sliding Door</SelectItem>
                    <SelectItem value="bifold">Bifold Door</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Door Width</Label>
                <Select
                  value={selectedObject.doorProperties.width.toString()}
                  onValueChange={(value) => handleDoorSizeChange(parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getStandardDoorSizes().map(size => (
                      <SelectItem key={size.width} value={size.width.toString()}>
                        {size.label} ({size.width}" wide)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Swing properties - only show for hinged doors */}
              {selectedObject.doorProperties.style !== 'sliding' && (
                <>
                  <div className="space-y-2">
                    <Label>Swing Direction</Label>
                    <RadioGroup
                      value={selectedObject.doorProperties.swingDirection}
                      onValueChange={(value: SwingDirection) => handleDoorPropertyChange('swingDirection', value)}
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="inward" id="inward" />
                        <Label htmlFor="inward">Inward</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="outward" id="outward" />
                        <Label htmlFor="outward">Outward</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div className="space-y-2">
                    <Label>Swing Side</Label>
                    <RadioGroup
                      value={selectedObject.doorProperties.swingSide}
                      onValueChange={(value: SwingSide) => handleDoorPropertyChange('swingSide', value)}
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="left" id="left" />
                        <Label htmlFor="left">Left</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="right" id="right" />
                        <Label htmlFor="right">Right</Label>
                      </div>
                    </RadioGroup>
                  </div>
                </>
              )}
            </>
          )}
          
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
          <div className="flex items-center justify-between mb-2">
            <Label htmlFor="roomName" className="text-lg font-medium">{selectedRoom.name || 'Unnamed Room'}</Label>
            {onDeleteRoom && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-red-500 border-red-200 hover:bg-red-50">
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete this room and all objects inside it.
                      You can also press the Delete key to remove the selected room.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onDeleteRoom} className="bg-red-500 hover:bg-red-600">
                      Delete Room
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
          
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
            <Label>Area & Perimeter</Label>
            <div className="grid grid-cols-2 gap-2">
              <div className="text-sm p-2 bg-slate-100 rounded">
                Area: {formatArea(area)}
              </div>
              <div className="text-sm p-2 bg-slate-100 rounded">
                Length: {perimeter.toFixed(1)} ft
              </div>
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