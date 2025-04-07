import React from 'react';
import { Room } from '@/utils/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { pixelsToFeet, feetToPixels, calculateRoomArea, formatArea } from '@/utils/canvas';

interface PropertyPanelProps {
  selectedRoom: Room | null;
  onUpdateRoom: (roomId: string, updates: Partial<Room>) => void;
}

const PropertyPanel: React.FC<PropertyPanelProps> = ({
  selectedRoom,
  onUpdateRoom,
}) => {
  if (!selectedRoom) {
    return (
      <aside className="w-72 border-l border-slate-200 bg-white p-4 hidden lg:block">
        <h2 className="font-semibold text-slate-700 mb-4">Room Properties</h2>
        <p className="text-slate-500 text-sm">Select a room to edit its properties</p>
      </aside>
    );
  }

  const roomArea = calculateRoomArea(selectedRoom);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateRoom(selectedRoom.id, { name: e.target.value });
  };

  const handleWidthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const widthInFeet = parseFloat(e.target.value);
    if (!isNaN(widthInFeet) && widthInFeet > 0) {
      const widthInPixels = feetToPixels(widthInFeet);
      onUpdateRoom(selectedRoom.id, { width: widthInPixels });
    }
  };

  const handleHeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const heightInFeet = parseFloat(e.target.value);
    if (!isNaN(heightInFeet) && heightInFeet > 0) {
      const heightInPixels = feetToPixels(heightInFeet);
      onUpdateRoom(selectedRoom.id, { height: heightInPixels });
    }
  };

  // Handle direct feet and inches input
  const handleWidthFeetInchesChange = (e: React.ChangeEvent<HTMLInputElement>, unit: 'feet' | 'inches') => {
    const value = parseInt(e.target.value);
    if (isNaN(value)) return;

    const currentWidthInFeet = pixelsToFeet(selectedRoom.width);
    const wholeFeet = Math.floor(currentWidthInFeet);
    const inches = Math.round((currentWidthInFeet - wholeFeet) * 12);
    
    let newWidthInFeet: number;
    
    if (unit === 'feet') {
      newWidthInFeet = value + (inches / 12);
    } else {
      newWidthInFeet = wholeFeet + (value / 12);
    }
    
    if (newWidthInFeet > 0) {
      const widthInPixels = feetToPixels(newWidthInFeet);
      onUpdateRoom(selectedRoom.id, { width: widthInPixels });
    }
  };

  const handleHeightFeetInchesChange = (e: React.ChangeEvent<HTMLInputElement>, unit: 'feet' | 'inches') => {
    const value = parseInt(e.target.value);
    if (isNaN(value)) return;

    const currentHeightInFeet = pixelsToFeet(selectedRoom.height);
    const wholeFeet = Math.floor(currentHeightInFeet);
    const inches = Math.round((currentHeightInFeet - wholeFeet) * 12);
    
    let newHeightInFeet: number;
    
    if (unit === 'feet') {
      newHeightInFeet = value + (inches / 12);
    } else {
      newHeightInFeet = wholeFeet + (value / 12);
    }
    
    if (newHeightInFeet > 0) {
      const heightInPixels = feetToPixels(newHeightInFeet);
      onUpdateRoom(selectedRoom.id, { height: heightInPixels });
    }
  };

  const handleXChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const xInFeet = parseFloat(e.target.value);
    if (!isNaN(xInFeet)) {
      const xInPixels = feetToPixels(xInFeet);
      onUpdateRoom(selectedRoom.id, { x: xInPixels });
    }
  };

  const handleYChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const yInFeet = parseFloat(e.target.value);
    if (!isNaN(yInFeet)) {
      const yInPixels = feetToPixels(yInFeet);
      onUpdateRoom(selectedRoom.id, { y: yInPixels });
    }
  };

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateRoom(selectedRoom.id, { color: e.target.value });
  };

  // Calculate feet and inches for width and height
  const widthInFeet = pixelsToFeet(selectedRoom.width);
  const widthFeet = Math.floor(widthInFeet);
  const widthInches = Math.round((widthInFeet - widthFeet) * 12);
  
  const heightInFeet = pixelsToFeet(selectedRoom.height);
  const heightFeet = Math.floor(heightInFeet);
  const heightInches = Math.round((heightInFeet - heightFeet) * 12);

  return (
    <aside className="w-72 border-l border-slate-200 bg-white p-4 hidden lg:block">
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-semibold text-slate-700">Room Properties</h2>
        <span className="text-sm font-medium text-primary">{formatArea(roomArea)}</span>
      </div>
      
      <div className="mb-4">
        <Label className="block text-sm font-medium text-slate-700 mb-1">Name</Label>
        <Input 
          type="text" 
          value={selectedRoom.name || ''} 
          onChange={handleNameChange}
          className="w-full"
        />
      </div>
      
      <Separator className="my-4" />
      
      <div className="mb-4">
        <Label className="block text-sm font-medium text-slate-700 mb-1">Width</Label>
        
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1">
            <span className="block text-xs text-slate-500">Feet</span>
            <Input 
              type="number" 
              value={widthFeet} 
              onChange={(e) => handleWidthFeetInchesChange(e, 'feet')}
              min="1"
              className="w-full"
            />
          </div>
          <div className="flex-1">
            <span className="block text-xs text-slate-500">Inches</span>
            <Input 
              type="number" 
              value={widthInches}
              onChange={(e) => handleWidthFeetInchesChange(e, 'inches')}
              min="0"
              max="11"
              className="w-full"
            />
          </div>
        </div>
        
        <span className="block text-xs text-slate-500">Decimal (ft)</span>
        <Input 
          type="number" 
          value={pixelsToFeet(selectedRoom.width).toFixed(1)} 
          onChange={handleWidthChange}
          step="0.1"
          min="1"
          className="w-full"
        />
      </div>
      
      <div className="mb-4">
        <Label className="block text-sm font-medium text-slate-700 mb-1">Height</Label>
        
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1">
            <span className="block text-xs text-slate-500">Feet</span>
            <Input 
              type="number" 
              value={heightFeet}
              onChange={(e) => handleHeightFeetInchesChange(e, 'feet')}
              min="1"
              className="w-full"
            />
          </div>
          <div className="flex-1">
            <span className="block text-xs text-slate-500">Inches</span>
            <Input 
              type="number" 
              value={heightInches}
              onChange={(e) => handleHeightFeetInchesChange(e, 'inches')}
              min="0"
              max="11"
              className="w-full"
            />
          </div>
        </div>
        
        <span className="block text-xs text-slate-500">Decimal (ft)</span>
        <Input 
          type="number" 
          value={pixelsToFeet(selectedRoom.height).toFixed(1)} 
          onChange={handleHeightChange}
          step="0.1"
          min="1"
          className="w-full"
        />
      </div>
      
      <Separator className="my-4" />
      
      <div className="mb-4">
        <Label className="block text-sm font-medium text-slate-700 mb-1">Position</Label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="block text-xs text-slate-500">X (ft)</span>
            <Input 
              type="number" 
              value={pixelsToFeet(selectedRoom.x).toFixed(1)} 
              onChange={handleXChange}
              step="0.1"
              className="w-full"
            />
          </div>
          <div>
            <span className="block text-xs text-slate-500">Y (ft)</span>
            <Input 
              type="number" 
              value={pixelsToFeet(selectedRoom.y).toFixed(1)} 
              onChange={handleYChange}
              step="0.1"
              className="w-full"
            />
          </div>
        </div>
      </div>
      
      <div className="mb-4">
        <Label className="block text-sm font-medium text-slate-700 mb-1">Color</Label>
        <div className="flex items-center space-x-2">
          <Input 
            type="color" 
            value={selectedRoom.color || '#93c5fd'} 
            onChange={handleColorChange}
            className="w-8 h-8 rounded border border-slate-300 p-0"
          />
          <span className="text-sm text-slate-600">{selectedRoom.color || '#93c5fd'}</span>
        </div>
      </div>
    </aside>
  );
};

export default PropertyPanel;
