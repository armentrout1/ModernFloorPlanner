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

import React, { useEffect, useId, useRef, useState } from 'react';
import { Room, RoomObject as RoomObjectType, DoorStyle, SwingDirection, SwingSide } from '@/utils/types';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { DoorOpenIcon, Square as WindowIcon, Trash2, FlipHorizontal, RotateCcw } from 'lucide-react';
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

function WindowPresetSelect({ dimension, value, choices, onChoose, custom = false }: {
  dimension: 'width' | 'height'; value: number | undefined; choices: number[]; custom?: boolean;
  onChoose: (size: number) => void;
}) {
  const id = useId();
  return <div className="min-w-0 space-y-1">
    <Label htmlFor={id} className="text-xs">Common {dimension}</Label>
    <Select value={custom ? 'custom' : value === undefined ? '' : choices.includes(value) ? String(value) : 'custom'}
      onValueChange={choice => { if (choices.includes(Number(choice))) onChoose(Number(choice)); }}>
      <SelectTrigger id={id} aria-label={'Common window ' + dimension} className="text-sm">
        <SelectValue placeholder="Not entered" />
      </SelectTrigger>
      <SelectContent>
        {choices.map(size => <SelectItem key={size} value={String(size)}>{size} in</SelectItem>)}
        <SelectItem value="custom" disabled>Custom</SelectItem>
      </SelectContent>
    </Select>
  </div>;
}

/** Raw text belongs to the form until a valid blur/Enter commit. Never replace
 * an empty field with a guessed 24/80-inch dimension or truncate a decimal.
 */
function OpeningNumberField({ label, value, onCommit, onDraftChange }: {
  label: string; value: number | undefined; onCommit: (value: number) => string | null | void;
  onDraftChange?: (dirty: boolean) => void;
}) {
  const id = useId();
  const [text, setText] = useState(value === undefined ? '' : String(value));
  const [error, setError] = useState<string | null>(null);
  const dirty = useRef(false);
  useEffect(() => {
    // An explicit preset/external selection replaces an unresolved size edit.
    setText(value === undefined ? '' : String(value));
    dirty.current = false;
    setError(null);
    onDraftChange?.(false);
  }, [value, onDraftChange]);
  const commit = () => {
    if (!dirty.current) return;
    const number = Number(text);
    if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(text.trim()) || !Number.isFinite(number)
        || number <= 0 || number > Number.MAX_SAFE_INTEGER) {
      setError('Enter a positive size in inches. This edit has not been applied.');
      return;
    }
    const message = onCommit(number);
    if (message) { setError(message); return; }
    dirty.current = false;
    setError(null);
    onDraftChange?.(false);
  };
  return <div className="space-y-1">
    <Label htmlFor={id} className="text-xs">{label}</Label>
    <Input id={id} type="number" step="any" min="0" value={text}
      placeholder="Not entered" className="text-sm" aria-invalid={Boolean(error)}
      aria-describedby={error ? id + '-error' : undefined}
      onChange={event => { setText(event.target.value); dirty.current = true; setError(null); onDraftChange?.(true); }}
      onBlur={commit}
      onKeyDown={event => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
          event.preventDefault(); commit(); event.currentTarget.blur();
        }
      }} />
    {error && <p id={id + '-error'} role="alert" className="text-xs text-red-700">{error}</p>}
  </div>;
}

function WindowSizeField({ dimension, value, choices, onCommit }: {
  dimension: 'width' | 'height'; value: number | undefined; choices: number[];
  onCommit: (size: number) => string | null;
}) {
  const [dirty, setDirty] = useState(false);
  const [presetVersion, setPresetVersion] = useState(0);
  return <div className="min-w-0 space-y-3">
    <WindowPresetSelect dimension={dimension} value={value} choices={choices} custom={dirty}
      onChoose={size => {
        if (!onCommit(size)) {
          // Re-selecting the saved size also replaces an unapplied custom draft.
          setDirty(false);
          setPresetVersion(version => version + 1);
        }
      }} />
    <OpeningNumberField key={presetVersion} label={'Window ' + dimension} value={value}
      onCommit={onCommit} onDraftChange={setDirty} />
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
    setSizeError(error);
    if (error) return error;
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
    setSizeError(error);
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
        <div className="p-4 space-y-4">
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
                <Label>Common door widths (inches)</Label>
                <Select
                  value={selectedObject.doorProperties.width.toString()}
                  onValueChange={value => handleDoorSizeChange(Number(value))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getStandardDoorSizes().map(size => (
                      <SelectItem key={size.width} value={size.width.toString()}>
                        {size.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500">Common nominal examples, not universal standards. Choosing a width keeps the current height.</p>
                {Math.abs(inchesToPixels(selectedObject.doorProperties.width) - selectedObject.size) > 1e-8 && (
                  <div className="text-xs text-amber-800 space-y-2">
                    <p>Saved widths disagree: the entered width is {selectedObject.doorProperties.width} inches;
                      the sketch width is {pixelsToInches(selectedObject.size)} inches. Verify the measurement.</p>
                    <Button variant="outline" size="sm" onClick={() => handleDoorSizeChange(selectedObject.doorProperties!.width)}>
                      Confirm entered width
                    </Button>
                  </div>
                )}
                <div className="text-xs text-slate-500">
                  Current size: {selectedObject.doorProperties.width}" × {selectedObject.doorProperties.height}"
                </div>
              </div>

              <div className="space-y-2">
                <Label>Custom size (inches)</Label>
                <div className="grid grid-cols-2 gap-2">
                  <OpeningNumberField key={selectedObject.id + ':door-width'} label="Door width"
                    value={selectedObject.doorProperties.width} onCommit={handleDoorSizeChange} />
                  <OpeningNumberField key={selectedObject.id + ':door-height'} label="Door height"
                    value={selectedObject.doorProperties.height} onCommit={height => handleDoorPropertyChange('height', height)} />
                </div>
                <p className="text-xs text-slate-500">Common heights include 80, 84 and 96 inches. Enter the size you need; changes apply on Enter or leaving the field.</p>
              </div>

              {/* Swing properties - only show for hinged doors */}
              {selectedObject.doorProperties.style !== 'sliding' && (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleDoorPropertyChange('swingSide', selectedObject.doorProperties!.swingSide === 'left' ? 'right' : 'left')}>
                      <FlipHorizontal className="mr-1.5 h-4 w-4" />Flip hinge
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleDoorPropertyChange('swingDirection', selectedObject.doorProperties!.swingDirection === 'inward' ? 'outward' : 'inward')}>
                      <RotateCcw className="mr-1.5 h-4 w-4" />Reverse swing
                    </Button>
                  </div>
                  <p className="text-xs text-slate-600">Opens {selectedObject.doorProperties.swingDirection === 'inward' ? 'into' : 'out of'} the room.</p>
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
                    <Label>Door Hand</Label>
                    <RadioGroup
                      value={getDoorHand(selectedObject.doorProperties.swingSide, selectedObject.doorProperties.swingDirection)}
                      onValueChange={(value: SwingSide) => handleDoorPropertyChange('swingSide', getStoredHinge(value, selectedObject.doorProperties!.swingDirection))}
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="left" id="lh" />
                        <Label htmlFor="lh">Left Hand (LH)</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="right" id="rh" />
                        <Label htmlFor="rh">Right Hand (RH)</Label>
                      </div>
                    </RadioGroup>
                    <div className="text-xs text-slate-500">
                      Stand with your back against the hinge jamb, facing the latch. The arm that follows the opening swing is the hand.
                      {' '}Double-click the door or its swing area to flip the hand.
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* Older windows have no measured height. Only an explicit entry or
              chosen nominal example adds the optional height. */}
          {selectedObject.type === 'window' && (
            <>
              <p className="text-xs text-slate-500">Sizes are in inches. Choose each dimension separately, or enter a custom size.</p>
              <div className="grid grid-cols-2 gap-2">
                <WindowSizeField key={selectedObject.id + ':window-width'} dimension="width"
                  value={pixelsToInches(selectedObject.size)} choices={COMMON_WINDOW_WIDTHS}
                  onCommit={handleWindowWidthChange} />
                <WindowSizeField key={selectedObject.id + ':window-height'} dimension="height"
                  value={selectedObject.windowProperties?.height} choices={COMMON_WINDOW_HEIGHTS}
                  onCommit={handleWindowHeightChange} />
              </div>
              <p className="text-xs text-slate-500">Custom sizes apply on Enter or leaving the field. Common sizes vary by window style and manufacturer; confirm the actual dimensions before ordering.</p>
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
          

        </div>
      )}
    </div>
  );
};

export default PropertyPanel;