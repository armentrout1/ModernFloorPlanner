import React from 'react';
import { Room } from '@/utils/types';
import { calculateMaterials } from '@/utils/materialCalculator';
import { formatArea } from '@/utils/canvas';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';

interface MaterialCalculationPanelProps {
  rooms: Room[];
}

const MaterialCalculationPanel: React.FC<MaterialCalculationPanelProps> = ({ rooms }) => {
  const materials = calculateMaterials(rooms);

  return (
    <div className="w-80 bg-white border-l border-slate-200 overflow-y-auto p-4">
      <h2 className="text-lg font-semibold mb-3">Material Calculations</h2>
      
      {materials.widthWarnings.length > 0 && (
        <div role="status" className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-semibold">Review saved door widths</p>
          <p>These doors have conflicting saved widths. Trim uses the entered width. Select each door and confirm its width in Properties.</p>
          <ul className="mt-2 space-y-1">
            {materials.widthWarnings.map(warning => (
              <li key={`${warning.roomId}:${warning.doorId}`}>
                {warning.roomName}, {warning.wallSide} wall: entered {warning.enteredWidthInches.toLocaleString(undefined, { maximumFractionDigits: 6 })} in; sketch {warning.sketchWidthInches.toLocaleString(undefined, { maximumFractionDigits: 6 })} in.
              </li>
            ))}
          </ul>
        </div>
      )}

      <Card className="mb-4">
        <CardHeader className="py-4">
          <CardTitle className="text-base">Floor Area</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-2xl font-bold">{formatArea(materials.totalArea)}</p>
        </CardContent>
      </Card>
      
      <Card className="mb-4">
        <CardHeader className="py-4">
          <CardTitle className="text-base">Baseboards & Trim</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Baseboard:</span>
              <span className="font-semibold">{materials.baseboardFeet.toFixed(1)} ft</span>
            </div>
            <div className="flex justify-between">
              <span>Base Shoe:</span>
              <span className="font-semibold">{materials.baseShoeboardFeet.toFixed(1)} ft</span>
            </div>
            <div className="flex justify-between">
              <span>Total Wall Length:</span>
              <span className="font-semibold">{materials.totalWallLengthFeet.toFixed(1)} ft</span>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card className="mb-4">
        <CardHeader className="py-4">
          <CardTitle className="text-base">Openings</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Doors:</span>
              <span className="font-semibold">{materials.doorCount}</span>
            </div>
            <div className="flex justify-between">
              <span>Windows:</span>
              <span className="font-semibold">{materials.windowCount}</span>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {materials.doorSizes.length > 0 && (
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-base">Door Sizes</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Width</TableHead>
                  <TableHead>Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {materials.doorSizes.map((doorSize, index) => (
                  <TableRow key={index}>
                    <TableCell>{(doorSize.width * 12).toLocaleString(undefined, { maximumFractionDigits: 6 })} in</TableCell>
                    <TableCell>{doorSize.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      
      <Separator className="my-4" />
      
      <div className="text-sm text-slate-500">
        <p className="mb-2">Note: These calculations are estimates based on the current floor plan.</p>
        <p>Material quantities may vary based on actual construction needs and waste factors.</p>
      </div>
    </div>
  );
};

export default MaterialCalculationPanel;