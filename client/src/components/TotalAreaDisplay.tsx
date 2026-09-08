import React from 'react';
import { Room } from '@/utils/types';
import { calculateTotalArea, formatArea } from '@/utils/canvas';
import { Card, CardContent } from '@/components/ui/card';

interface TotalAreaDisplayProps {
  rooms: Room[];
}

const TotalAreaDisplay: React.FC<TotalAreaDisplayProps> = ({ rooms }) => {
  const totalArea = calculateTotalArea(rooms);
  
  return (
    <div data-testid="canvas-totals" className="max-w-full">
      <Card className="shadow-md">
        <CardContent className="p-2">
          <div className="flex items-center">
            <div>
              <p className="text-xs text-slate-500">Total Area</p>
              <p className="font-semibold text-primary">{formatArea(totalArea)}</p>
            </div>
            <div className="ml-3 pl-3 border-l border-slate-200">
              <p className="text-xs text-slate-500">Rooms</p>
              <p className="font-semibold">{rooms.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TotalAreaDisplay;