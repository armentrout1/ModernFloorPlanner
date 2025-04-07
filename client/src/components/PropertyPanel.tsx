import React from 'react';
import { Room } from '@/utils/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { pixelsToFeet } from '@/utils/canvas';

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
      <aside className="w-64 border-l border-slate-200 bg-white p-4 hidden lg:block">
        <h2 className="font-semibold text-slate-700 mb-4">Room Properties</h2>
        <p className="text-slate-500 text-sm">Select a room to edit its properties</p>
      </aside>
    );
  }

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateRoom(selectedRoom.id, { name: e.target.value });
  };

  const handleWidthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const widthInFeet = parseFloat(e.target.value);
    if (!isNaN(widthInFeet) && widthInFeet > 0) {
      const widthInPixels = widthInFeet * 20; // 1 foot = 20 pixels
      onUpdateRoom(selectedRoom.id, { width: widthInPixels });
    }
  };

  const handleHeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const heightInFeet = parseFloat(e.target.value);
    if (!isNaN(heightInFeet) && heightInFeet > 0) {
      const heightInPixels = heightInFeet * 20; // 1 foot = 20 pixels
      onUpdateRoom(selectedRoom.id, { height: heightInPixels });
    }
  };

  const handleXChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const xInFeet = parseFloat(e.target.value);
    if (!isNaN(xInFeet)) {
      const xInPixels = xInFeet * 20; // 1 foot = 20 pixels
      onUpdateRoom(selectedRoom.id, { x: xInPixels });
    }
  };

  const handleYChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const yInFeet = parseFloat(e.target.value);
    if (!isNaN(yInFeet)) {
      const yInPixels = yInFeet * 20; // 1 foot = 20 pixels
      onUpdateRoom(selectedRoom.id, { y: yInPixels });
    }
  };

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateRoom(selectedRoom.id, { color: e.target.value });
  };

  return (
    <aside className="w-64 border-l border-slate-200 bg-white p-4 hidden lg:block">
      <h2 className="font-semibold text-slate-700 mb-4">Room Properties</h2>
      
      <div className="mb-4">
        <Label className="block text-sm font-medium text-slate-700 mb-1">Name</Label>
        <Input 
          type="text" 
          value={selectedRoom.name || ''} 
          onChange={handleNameChange}
          className="w-full"
        />
      </div>
      
      <div className="mb-4">
        <Label className="block text-sm font-medium text-slate-700 mb-1">Dimensions</Label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="block text-xs text-slate-500">Width (ft)</span>
            <Input 
              type="number" 
              value={pixelsToFeet(selectedRoom.width).toFixed(1)} 
              onChange={handleWidthChange}
              step="0.1"
              min="3"
              className="w-full"
            />
          </div>
          <div>
            <span className="block text-xs text-slate-500">Height (ft)</span>
            <Input 
              type="number" 
              value={pixelsToFeet(selectedRoom.height).toFixed(1)} 
              onChange={handleHeightChange}
              step="0.1"
              min="3"
              className="w-full"
            />
          </div>
        </div>
      </div>
      
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
