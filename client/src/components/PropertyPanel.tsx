import { getDoorHand, getStoredHinge } from "@/utils/doorGeometry";
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

import React, { useEffect, useId, useState } from 'react';
import { Room, RoomObject as RoomObjectType, DoorStyle, SwingDirection, SwingSide } from '@/utils/types';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import OpeningSizeField from './OpeningSizeField';
import { DoorOpenIcon, Square as WindowIcon, Trash2, Info } from 'lucide-react';
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

const COMMON_WINDOW_WIDTHS = [24, 30, 36, 48, 60, 72];
const COMMON_WINDOW_HEIGHTS = [24, 36, 48, 60, 72];

function OpeningChoice({ label, value, options, onChange }: {
  label: string; value: string; options: { value: string; label: string; shortLabel?: string }[];
  onChange: (value: string) => void;
}) {
  const id = useId();
  return <div className="space-y-1.5">
    <Label id={id} className="text-xs">{label}</Label>
    <RadioGroup aria-labelledby={id} value={value} onValueChange={onChange}
      className="grid grid-cols-2 gap-1 rounded-md bg-slate-100 p-1" orientation="horizontal">
      {options.map(option => <div key={option.value} className="relative min-w-0">
        <RadioGroupItem id={id + option.value} value={option.value} aria-label={option.label}
          className="h-8 w-full rounded border-0 data-[state=checked]:bg-white data-[state=checked]:shadow-sm [&>span]:hidden" />
        <Label htmlFor={id + option.value}
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-medium">
          {option.shortLabel ?? option.label}
        </Label>
      </div>)}
    </RadioGroup>
  </div>;
}

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
  const [sizeError, setSizeError] = useState<string | null>(null);
  useEffect(() => { setSizeError(null); }, [selectedObject?.id]);

  const widthError = (width: number): string | null => {
    if (!selectedRoom || !selectedObject) return 'Select an opening first.';
    const span = inchesToPixels(width);
    if (!Number.isFinite(span) || span <= 0) return 'Enter a positive finite width.';
    const horizontal = selectedObject.wallSide === 'top' || selectedObject.wallSide === 'bottom';
    const wallLength = horizontal ? selectedRoom.width : selectedRoom.height;
    const center = wallLength * selectedObject.position / 100;
    const start = center - span / 2, end = center + span / 2;
    if (start < 0 || end > wallLength) return 'This width extends past the wall. Choose a smaller width or move the opening first.';
    for (const other of selectedRoom.objects ?? []) {
      if (other.id === selectedObject.id || other.wallSide !== selectedObject.wallSide) continue;
      const otherSpan = other.type === 'door' && other.doorProperties
        ? inchesToPixels(other.doorProperties.width) : other.size;
      const otherCenter = wallLength * other.position / 100;
      if (start < otherCenter + otherSpan / 2 && end > otherCenter - otherSpan / 2) {
        return 'This width overlaps another opening. Choose a smaller width or move the opening first.';
      }
    }
    return null;
  };

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

  const handleDoorSizeChange = (width: number): string | null => {
    const error = widthError(width);
    if (error) return error;
    setSizeError(null);
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
    return null;
  };

  const handleWindowWidthChange = (width: number): string | null => {
    const error = widthError(width);
    if (error) return error;
    if (selectedRoom && selectedObject?.type === 'window' && selectedRoom.objects) {
      onUpdateRoom(selectedRoom.id, { objects: selectedRoom.objects.map(object => object.id === selectedObject.id
        ? { ...object, size: inchesToPixels(width) } : object) });
    }
    return null;
  };

  const handleWindowHeightChange = (height: number): string | null => {
    if (!Number.isFinite(height) || height <= 0 || height > Number.MAX_SAFE_INTEGER) return 'Enter a positive size in inches.';
    if (selectedRoom && selectedObject?.type === 'window' && selectedRoom.objects) {
      // Height does not alter the plan-view opening or revalidate its legacy width.
      onUpdateRoom(selectedRoom.id, { objects: selectedRoom.objects.map(object => object.id === selectedObject.id
        ? { ...object, windowProperties: { ...object.windowProperties, height } } : object) });
    }
    return null;
  };

  // Calculate room dimensions in feet if a room is selected
  const widthFeet = selectedRoom ? pixelsToFeet(selectedRoom.width) : 0;
  const heightFeet = selectedRoom ? pixelsToFeet(selectedRoom.height) : 0;
  const area = selectedRoom ? calculateRoomArea(selectedRoom) : 0;
  const perimeter = selectedRoom ? calculateRoomPerimeter(selectedRoom) : 0;
  
  return (
    <div className="flex flex-col">
      
      {!selectedRoom ? (
        // No room selected
        <div className="p-4 flex-grow flex items-center justify-center">
          <div className="text-center text-slate-500 p-4">
            <p>Select a room to edit its properties</p>
          </div>
        </div>
      ) : selectedObject ? (
        // Object properties section
        <div className="p-4 space-y-3" data-testid="inspector-opening-properties">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              {selectedObject.type === 'door' ? (
                <DoorOpenIcon className="h-5 w-5 text-orange-500" />
              ) : (
                <WindowIcon className="h-5 w-5 text-blue-500" />
              )}
              <span className="font-medium capitalize">{selectedObject.type} {(selectedRoom.objects?.filter(object => object.type === selectedObject.type).findIndex(object => object.id === selectedObject.id) ?? 0) + 1}</span>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              className="shrink-0"
              onClick={onDeleteRoom}
              aria-label={`Delete ${selectedObject.type}`}
            >
              <Trash2 className="mr-1.5 h-4 w-4 text-red-500" />Delete {selectedObject.type}
            </Button>
          </div>

          {sizeError && <p role="alert" className="text-xs text-red-700">{sizeError}</p>}

          {/* Door-specific properties */}
          {selectedObject.type === 'door' && selectedObject.doorProperties && (
            <>
              <div className="space-y-2">
                <Label htmlFor="opening-door-style" className="text-xs">Door style</Label>
                <Select
                  value={selectedObject.doorProperties.style}
                  onValueChange={(value: DoorStyle) => handleDoorPropertyChange('style', value)}
                >
                  <SelectTrigger id="opening-door-style" aria-label="Door style" className="h-9">
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

              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,120px),1fr))] gap-2">
                <OpeningSizeField key={selectedObject.id + ':door-width'} label="Door width"
                  value={selectedObject.doorProperties.width} choices={getStandardDoorSizes().map(size => size.width)}
                  onCommit={handleDoorSizeChange} />
                <OpeningSizeField key={selectedObject.id + ':door-height'} label="Door height"
                  value={selectedObject.doorProperties.height} choices={[80, 84, 96]}
                  onCommit={height => handleDoorPropertyChange('height', height)} />
              </div>
              {Math.abs(inchesToPixels(selectedObject.doorProperties.width) - selectedObject.size) > 1e-8 && (
                <div className="text-xs text-amber-800 space-y-2">
                  <p>Saved widths disagree: the entered width is {selectedObject.doorProperties.width} inches;
                    the sketch width is {pixelsToInches(selectedObject.size)} inches. Verify the measurement.</p>
                  <Button variant="outline" size="sm" onClick={() => setSizeError(handleDoorSizeChange(selectedObject.doorProperties!.width))}>
                    Confirm entered width
                  </Button>
                </div>
              )}

              {selectedObject.doorProperties.style !== 'sliding' && <>
                <OpeningChoice label="Swing" value={selectedObject.doorProperties.swingDirection}
                  options={[{ value: 'inward', label: 'Inward' }, { value: 'outward', label: 'Outward' }]}
                  onChange={value => handleDoorPropertyChange('swingDirection', value as SwingDirection)} />
                <OpeningChoice label="Hand" value={getDoorHand(selectedObject.doorProperties.swingSide, selectedObject.doorProperties.swingDirection)}
                  options={[{ value: 'left', label: 'Left Hand (LH)', shortLabel: 'Left (LH)' }, { value: 'right', label: 'Right Hand (RH)', shortLabel: 'Right (RH)' }]}
                  onChange={value => handleDoorPropertyChange('swingSide', getStoredHinge(value as SwingSide, selectedObject.doorProperties!.swingDirection))} />
              </>}
            </>
          )}

          {/* Older windows have no measured height. Only an explicit entry or
              chosen nominal example adds the optional height. */}
          {selectedObject.type === 'window' && (
            <>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,120px),1fr))] gap-2">
                <OpeningSizeField key={selectedObject.id + ':window-width'} label="Window width"
                  value={pixelsToInches(selectedObject.size)} choices={COMMON_WINDOW_WIDTHS}
                  onCommit={handleWindowWidthChange} />
                <OpeningSizeField key={selectedObject.id + ':window-height'} label="Window height"
                  value={selectedObject.windowProperties?.height} choices={COMMON_WINDOW_HEIGHTS}
                  onCommit={handleWindowHeightChange} />
              </div>
            </>
          )}

          <div className="border-t pt-3 text-xs text-slate-500">
            <p data-testid="inspector-opening-location" className="font-medium text-slate-700">
              <span className="capitalize">{selectedObject.wallSide} wall</span> &middot; {Math.round(selectedObject.position)}% along wall
            </p>
            <p className="mt-1">Drag along the wall to move.</p>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="ghost" className="h-8 gap-1.5 px-0 text-xs text-slate-500">
                <Info aria-hidden="true" className="h-3.5 w-3.5" />{selectedObject.type === 'door' ? 'Size & swing tips' : 'Size tips'}
              </Button>
            </PopoverTrigger>
            <PopoverContent side="left" align="end" className="max-w-[calc(100vw-2rem)] space-y-2 text-xs">
              <p>Type an exact size in inches, or use the arrow beside it to choose a common size. Typed edits apply on Enter or leaving the field.</p>
              <p>Common sizes vary by style and manufacturer. Confirm actual dimensions before ordering.</p>
              {selectedObject.type === 'door' && <>
                <p>Inward opens into the room; outward opens out of it.</p>
                <p>Stand with your back against the hinge jamb, facing the latch. The arm that follows the opening swing is the hand. Double-click the door or its swing area to flip the hand.</p>
              </>}
            </PopoverContent>
          </Popover>
        </div>
      ) : (
        // Room properties section
        <div className="p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
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
                      This removes the room and its openings. Undo delete can restore them during this sketch session.
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
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,120px),1fr))] gap-2">
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
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,120px),1fr))] gap-2">
              <div className="text-sm p-2 bg-slate-100 rounded">
                Area: {formatArea(area)}
              </div>
              <div className="text-sm p-2 bg-slate-100 rounded">
                Length: {perimeter.toFixed(1)} ft
              </div>
            </div>
          </div>
          

        </div>
      )}
    </div>
  );
};

export default PropertyPanel;