import React from 'react';
import { SavedSketch } from '@/utils/api';
import { formatDimensions } from '@/utils/canvas';

interface SketchPreviewProps {
  sketch: SavedSketch;
  onClick?: () => void;
  selected?: boolean;
}

const SketchPreview: React.FC<SketchPreviewProps> = ({ 
  sketch, 
  onClick, 
  selected = false 
}) => {
  // Calculate boundaries to determine the scale for the preview
  const calculateBoundaries = () => {
    if (!sketch.rooms.length) return { minX: 0, minY: 0, maxX: 200, maxY: 200, width: 200, height: 200 };
    
    const minX = Math.min(...sketch.rooms.map(room => room.x));
    const minY = Math.min(...sketch.rooms.map(room => room.y));
    const maxX = Math.max(...sketch.rooms.map(room => room.x + room.width));
    const maxY = Math.max(...sketch.rooms.map(room => room.y + room.height));
    
    const width = maxX - minX;
    const height = maxY - minY;
    
    return { minX, minY, maxX, maxY, width, height };
  };
  
  const { minX, minY, width, height } = calculateBoundaries();
  
  // Calculate scale to fit preview in container
  const calculateScale = () => {
    const containerWidth = 150;
    const containerHeight = 100;
    const scaleX = containerWidth / (width || 1);
    const scaleY = containerHeight / (height || 1);
    return Math.min(scaleX, scaleY, 1) * 0.8; // Use 80% of the max scale for padding
  };
  
  const scale = calculateScale();
  
  // Format the date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' });
  };
  
  return (
    <div 
      className={`p-3 border rounded-md cursor-pointer transition-colors ${
        selected ? 'bg-accent/10 border-accent' : 'bg-white hover:bg-slate-50 border-slate-200'
      }`}
      onClick={onClick}
    >
      <div className="font-medium mb-1 truncate">{sketch.name}</div>
      <div className="text-xs text-slate-500 mb-2">
        {formatDate(sketch.updatedAt)}
      </div>
      
      <div className="relative h-[100px] bg-slate-100 rounded overflow-hidden border border-slate-200">
        <div 
          className="absolute inset-0"
          style={{ 
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            marginLeft: `${Math.max(0, -minX * scale + 10)}px`,
            marginTop: `${Math.max(0, -minY * scale + 10)}px`
          }}
        >
          {sketch.rooms.map(room => (
            <div
              key={room.id}
              className="absolute border-2 bg-primary/20 border-primary"
              style={{
                left: `${room.x}px`,
                top: `${room.y}px`,
                width: `${room.width}px`,
                height: `${room.height}px`,
              }}
            >
              <div className="text-[6px] p-0.5 text-slate-600 truncate">
                {room.name || 'Room'}
              </div>
            </div>
          ))}
        </div>
        <div className="absolute bottom-1 right-1 text-[8px] font-mono bg-white/70 px-1 py-0.5 rounded">
          {sketch.rooms.length} rooms
        </div>
      </div>
    </div>
  );
};

export default SketchPreview;