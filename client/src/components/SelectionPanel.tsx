import { useEffect, useState, type ReactNode } from 'react';
import type { Room } from '@/utils/types';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, DoorOpen, Square } from 'lucide-react';
import { pixelsToInches } from '@/utils/canvas';

type InspectorTab = 'room' | 'doors' | 'windows';
interface Props {
  rooms: Room[]; selectedRoomIds: string[]; selectedObjectId: string | null;
  onSelectRoom: (id: string) => void; onSelectObject: (id: string) => void;
  onClearSelection: () => void;
  onGroup: () => void; onUngroup: () => void; onDelete: () => void; children: ReactNode;
}

export default function SelectionPanel({ rooms, selectedRoomIds, selectedObjectId,
  onSelectRoom, onSelectObject, onClearSelection, onGroup, onUngroup, onDelete, children }: Props) {
  const selected = rooms.filter(room => selectedRoomIds.includes(room.id));
  const objectRoom = rooms.find(room => room.objects?.some(object => object.id === selectedObjectId));
  const selectedObject = objectRoom?.objects?.find(object => object.id === selectedObjectId);
  const selectionKey = JSON.stringify([selectedRoomIds, selectedObjectId]);
  // Browsing a category keeps its room context but clears the editing target.
  // A new canvas selection immediately supersedes that local browse state.
  const [browse, setBrowse] = useState<{ selectionKey: string; roomId: string | null; tab: InspectorTab } | null>(null);
  useEffect(() => {
    if (browse && browse.selectionKey !== selectionKey) setBrowse(null);
  }, [selectionKey, browse]);
  const browsing = browse?.selectionKey === selectionKey ? browse : null;
  const context = browsing ? rooms.find(room => room.id === browsing.roomId)
    : objectRoom ?? (selected.length === 1 ? selected[0] : undefined);
  const tab: InspectorTab = browsing?.tab ?? (selectedObject?.type === 'door' ? 'doors' : selectedObject?.type === 'window' ? 'windows' : 'room');
  const groupIds = new Set(selected.map(room => room.groupId).filter(Boolean));
  const grouped = groupIds.size === 1 && selected.every(room => room.groupId);
  const nameOf = (room: Room) => room.name || `Room ${rooms.indexOf(room) + 1}`;
  const browseCategory = (roomId: string | null, nextTab: InspectorTab) => {
    setBrowse({ selectionKey: JSON.stringify([[], null]), roomId, tab: nextTab });
    onClearSelection();
  };
  const changeTab = (value: string) => {
    if (!context) return;
    const nextTab = value as InspectorTab;
    if (nextTab === 'room') { setBrowse(null); onSelectRoom(context.id); }
    else if (nextTab !== tab) browseCategory(context.id, nextTab);
  };
  const counts = { door: context?.objects?.filter(item => item.type === 'door').length ?? 0,
    window: context?.objects?.filter(item => item.type === 'window').length ?? 0 };

  return <div data-testid="selection-inspector" className="flex h-full min-h-0 flex-col bg-white">
    {!context ? <div className="min-h-0 overflow-y-auto">
      {selected.length > 1 && !selectedObjectId && <section className="p-4 border-b space-y-3" aria-label="Room selection">
        <p className="font-semibold text-sm" role="status">{selected.length} rooms selected{grouped ? ' · Grouped' : ''}</p>
        <p className="text-xs text-slate-500">Drag any selected room to move them together.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onGroup} disabled={grouped}>Group rooms</Button>
          {groupIds.size > 0 && <Button size="sm" variant="outline" onClick={onUngroup}>Ungroup</Button>}
          <Button size="sm" variant="outline" onClick={onDelete} className="text-red-700">Delete {selected.length} rooms</Button>
        </div>
        {grouped && <p className="text-xs text-slate-500">Choose a room below to edit it individually. It stays in the group.</p>}
      </section>}
      <section className="p-4 space-y-3" aria-label="Drawing contents">
        <h2 className="text-lg font-semibold">Rooms</h2>
        <p className="text-sm text-slate-500">{rooms.length ? 'Choose a room to see its details, doors and windows.' : 'Draw a room to get started.'}</p>
        <div className="space-y-2">
          {rooms.map(room => <Button key={room.id} variant="outline" className="h-auto w-full justify-start gap-3 px-3 py-3 text-left whitespace-normal"
            onClick={() => { setBrowse(null); onSelectRoom(room.id); }} aria-label={`Edit room ${nameOf(room)}`}>
            <span aria-hidden="true" className="h-7 w-7 shrink-0 rounded border" style={{ backgroundColor: room.color || '#93c5fd' }} />
            <span className="min-w-0"><span className="block break-words font-medium">{nameOf(room)}</span>
              <span className="block text-xs font-normal text-slate-500">{room.objects?.filter(item => item.type === 'door').length ?? 0} doors · {room.objects?.filter(item => item.type === 'window').length ?? 0} windows{room.groupId ? ' · Grouped' : ''}</span>
            </span>
          </Button>)}
        </div>
      </section>
    </div> : <>
      <div className="shrink-0 border-b px-4 pt-2 pb-3">
        <Button size="sm" variant="ghost" className="-ml-2 mb-1 h-8 px-2 text-slate-600" onClick={() => browseCategory(null, 'room')}>
          <ArrowLeft aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />All rooms
        </Button>
        <h2 className="break-words text-lg font-semibold" data-testid="inspector-room-name">{nameOf(context)}</h2>
        {context.groupId && <p className="mt-1 text-xs text-slate-500">Grouped room · stays connected when moved</p>}
      </div>
      <Tabs value={tab} onValueChange={changeTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList aria-label="Room inspector" onMouseDownCapture={event => {
          // Radix activates on mousedown. Commit a field's blur before its panel unmounts.
          const focused = document.activeElement;
          if (focused instanceof HTMLElement && focused.closest('[data-testid="selection-inspector"]')
              && !event.currentTarget.contains(focused)) focused.blur();
        }} className="m-3 grid h-auto shrink-0 grid-cols-3">
          <TabsTrigger value="room" className="h-10 min-w-0 px-1 text-xs">Room</TabsTrigger>
          <TabsTrigger value="doors" aria-label={`Doors (${counts.door})`} className="h-10 min-w-0 flex-col gap-0 px-1 py-1 text-xs">Doors <span className="rounded bg-slate-100 px-1 text-[10px]">{counts.door}</span></TabsTrigger>
          <TabsTrigger value="windows" aria-label={`Windows (${counts.window})`} className="h-10 min-w-0 flex-col gap-0 px-1 py-1 text-xs">Windows <span className="rounded bg-slate-100 px-1 text-[10px]">{counts.window}</span></TabsTrigger>
        </TabsList>
        <TabsContent value="room" className="m-0 min-h-0 flex-1 overflow-y-auto">
          {context.groupId && <div className="px-4 pb-1"><Button size="sm" variant="outline" onClick={onUngroup}>Ungroup</Button></div>}
          {children}
        </TabsContent>
        {(['door', 'window'] as const).map(type => {
          const items = context.objects?.filter(item => item.type === type) ?? [];
          const current = objectRoom?.id === context.id && selectedObject?.type === type;
          return <TabsContent key={type} value={type === 'door' ? 'doors' : 'windows'} className="m-0 min-h-0 flex-1 overflow-y-auto">
            <section className="space-y-2 px-4 pb-3" aria-label={`${type === 'door' ? 'Doors' : 'Windows'} in ${nameOf(context)}`}>
              <p className="text-xs text-slate-500">{items.length ? `Choose a ${type} to edit its size and properties.` : `No ${type === 'door' ? 'doors' : 'windows'} in this room. Use Add ${type === 'door' ? 'Door' : 'Window'} and click a wall.`}</p>
              <div className="max-h-44 space-y-2 overflow-y-auto">
                {items.map((item, index) => {
                  const active = selectedObjectId === item.id;
                  const width = item.type === 'door' && item.doorProperties ? item.doorProperties.width : pixelsToInches(item.size);
                  const Icon = type === 'door' ? DoorOpen : Square;
                  return <Button key={item.id} variant="outline" aria-pressed={active}
                    className={`h-auto w-full justify-start gap-2 whitespace-normal px-3 py-2.5 text-left ${active ? 'border-blue-500 bg-blue-50 text-blue-800 hover:bg-blue-100' : ''}`}
                    onClick={() => onSelectObject(item.id)} aria-label={`Select ${type} ${index + 1} in ${nameOf(context)}`}>
                    <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                    <span><span className="block font-medium">{type === 'door' ? 'Door' : 'Window'} {index + 1}</span>
                      <span className="block text-xs font-normal capitalize">{item.wallSide} wall · {Number(width.toFixed(2))} in</span></span>
                  </Button>;
                })}
              </div>
            </section>
            {current && <div className="border-t">{children}</div>}
          </TabsContent>;
        })}
      </Tabs>
    </>}
  </div>;
}
