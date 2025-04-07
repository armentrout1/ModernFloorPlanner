import React from 'react';
import { Room } from '@/utils/types';

interface PreviewModeProps {
  rooms: Room[];
  scale: number;
}

const PreviewMode: React.FC<PreviewModeProps> = ({ rooms, scale }) => {
  return (
    <div className="absolute inset-0 bg-white/95 z-10 p-4">
      <div className="w-full h-full border-2 border-dashed border-slate-200 rounded-lg p-8 overflow-auto">
        <h2 className="text-xl font-semibold mb-4 text-center">Floor Plan Preview</h2>
        <div className="relative" style={{ 
          transform: `scale(${Math.min(0.5, scale)})`,
          transformOrigin: 'top left'
        }}>
          {rooms.map(room => (
            <div
              key={room.id + '-preview'}
              className="absolute shadow-lg"
              style={{
                left: `${room.x}px`,
                top: `${room.y}px`,
                width: `${room.width}px`,
                height: `${room.height}px`,
                backgroundColor: room.color || '#93c5fd',
                borderRadius: '4px',
              }}
            >
              {/* Room name */}
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-medium text-black/70">
                  {room.name || 'Room'}
                </span>
              </div>
              
              {/* Room objects (simplified) */}
              {room.objects?.map(object => {
                // Calculate position based on wall side
                let x = 0, y = 0, width = 0, height = 0;
                const objectWidth = object.type === 'door' ? 40 : 30;
                
                if (object.wallSide === 'top') {
                  x = (room.width * object.position / 100) - (objectWidth / 2);
                  y = -5;
                  width = objectWidth;
                  height = 10;
                } else if (object.wallSide === 'right') {
                  x = room.width - 5;
                  y = (room.height * object.position / 100) - (objectWidth / 2);
                  width = 10;
                  height = objectWidth;
                } else if (object.wallSide === 'bottom') {
                  x = (room.width * object.position / 100) - (objectWidth / 2);
                  y = room.height - 5;
                  width = objectWidth;
                  height = 10;
                } else if (object.wallSide === 'left') {
                  x = -5;
                  y = (room.height * object.position / 100) - (objectWidth / 2);
                  width = 10;
                  height = objectWidth;
                }
                
                return (
                  <div
                    key={object.id + '-preview'}
                    className={`absolute ${object.type === 'door' ? 'bg-orange-500' : 'bg-blue-500'}`}
                    style={{
                      left: `${x}px`,
                      top: `${y}px`,
                      width: `${width}px`,
                      height: `${height}px`,
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <div className="mt-6 text-center text-sm text-slate-500">
          <p>Press the eye icon again or ESC to exit preview mode</p>
          <p className="mt-2">Press 'P' key anytime to quickly toggle preview</p>
        </div>
      </div>
    </div>
  );
};

export default PreviewMode;