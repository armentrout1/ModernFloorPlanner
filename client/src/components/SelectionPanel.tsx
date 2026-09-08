import type { ReactNode } from 'react';
import type { Room } from '@/utils/types';
import { Button } from '@/components/ui/button';
import { pixelsToInches } from '@/utils/canvas';

interface Props {
  rooms: Room[]; selectedRoomIds: string[]; selectedObjectId: string | null;
  onSelectRoom: (id: string) => void; onSelectObject: (id: string) => void;
  onGroup: () => void; onUngroup: () => void; onDelete: () => void; children: ReactNode;
}

export default function SelectionPanel({ rooms, selectedRoomIds, selectedObjectId,
  onSelectRoom, onSelectObject, onGroup, onUngroup, onDelete, children }: Props) {
  const selected = rooms.filter(room => selectedRoomIds.includes(room.id));
  const groupIds = new Set(selected.map(room => room.groupId).filter(Boolean));
  const grouped = groupIds.size === 1 && selected.every(room => room.groupId);
  return <div className="h-full overflow-y-auto">
    {selected.length > 0 && !selectedObjectId && <section className="p-3 border-b space-y-2" aria-label="Room selection">
      <p className="font-medium text-sm" role="status">{selected.length} {selected.length === 1 ? 'room selected' : 'rooms selected'}{grouped ? ' · Grouped' : ''}</p>
      <p className="text-xs text-slate-500">{selected.length > 1 ? 'Drag any selected room to move them together.' : 'Edit this room, or select another item below.'}</p>
      <div className="flex flex-wrap gap-2">
        {selected.length > 1 && <Button size="sm" variant="outline" onClick={onGroup} disabled={grouped}>Group rooms</Button>}
        {groupIds.size > 0 && <Button size="sm" variant="outline" onClick={onUngroup}>Ungroup</Button>}
        {selected.length > 1 && <Button size="sm" variant="outline" onClick={onDelete} className="text-red-700">Delete {selected.length} rooms</Button>}
      </div>
      {grouped && <p className="text-xs text-slate-500">Group membership is saved with the sketch. Double-click a room or use the list below to edit it individually.</p>}
    </section>}
    {(selected.length <= 1 || selectedObjectId) && <div className="[&>div]:h-auto">{children}</div>}
    <section className="p-3 border-t space-y-2" aria-label="Drawing contents">
      <h2 className="font-medium text-sm">Drawing contents</h2>
      <p className="text-xs text-slate-500">Select an exact room, door or window here when it is hard to click on the drawing.</p>
      {rooms.length === 0 && <p className="text-sm text-slate-500">Draw a room to get started.</p>}
      {rooms.map((room, index) => <details key={room.id} open={selectedRoomIds.includes(room.id) || room.objects?.some(object => object.id === selectedObjectId)}>
        <summary className="py-1 text-sm cursor-pointer">{room.name || `Room ${index + 1}`}{room.groupId ? ' · Grouped' : ''}</summary>
        <div className="pl-3 space-y-1">
          <Button size="sm" variant="outline" className="w-full justify-start" onClick={() => onSelectRoom(room.id)} aria-label={`Edit room ${room.name || index + 1}`}>Edit this room</Button>
          {room.objects?.map((object, number) => <Button key={object.id} size="sm" variant={selectedObjectId === object.id ? 'default' : 'ghost'} className="w-full justify-start h-auto whitespace-normal text-left" onClick={() => onSelectObject(object.id)} aria-label={`Select ${object.type} ${number + 1} in ${room.name || `Room ${index + 1}`}`}>
            {object.type === 'door' ? 'Door' : 'Window'} {number + 1} · {object.wallSide} · {Number(pixelsToInches(object.size).toFixed(2))}″
          </Button>)}
        </div>
      </details>)}
    </section>
  </div>;
}
