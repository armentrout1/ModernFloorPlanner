import { ChevronDown, Copy, FilePlus2, FolderOpen, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface PlanMenuProps {
  canSave: boolean;
  onNewPlan: () => void;
  onOpenPlan: () => void;
  onSavePlan: () => void;
  onOpenPhysicalCopy: () => void;
}

export default function PlanMenu({
  canSave,
  onNewPlan,
  onOpenPlan,
  onSavePlan,
  onOpenPhysicalCopy,
}: PlanMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2" aria-label="Plan menu">
          <span>Plan</span>
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="z-[60] w-56 bg-white">
        <DropdownMenuLabel>Plan</DropdownMenuLabel>
        <DropdownMenuItem onSelect={onNewPlan}>
          <FilePlus2 aria-hidden="true" />
          New plan
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onOpenPlan}>
          <FolderOpen aria-hidden="true" />
          Open plan
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onSavePlan} disabled={!canSave}>
          <Save aria-hidden="true" />
          Save plan
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onOpenPhysicalCopy} disabled={!canSave}>
          <Copy aria-hidden="true" />
          Open a physical copy
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
