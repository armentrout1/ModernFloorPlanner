import { Check, Search } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import { DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  EDITOR_COMMAND_GROUPS,
  EDITOR_COMMANDS,
  getEditorCommandAvailability,
  getEditorCommandLabel,
  type EditorCommandContext,
  type EditorCommandId,
} from './registry';

interface EditorCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTool: string;
  context: EditorCommandContext;
  onRunCommand: (commandId: EditorCommandId) => void;
}

export default function EditorCommandPalette({
  open,
  onOpenChange,
  activeTool,
  context,
  onRunCommand,
}: EditorCommandPaletteProps) {
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <DialogTitle className="sr-only">More tools</DialogTitle>
      <DialogDescription className="sr-only">
        Search drawing tools and editor commands. Unavailable commands show what is required.
      </DialogDescription>
      <CommandInput aria-label="Search tools and commands" placeholder="Search tools and commands…" />
      <CommandList aria-label="Editor commands">
        <CommandEmpty>No tools or commands found.</CommandEmpty>
        {EDITOR_COMMAND_GROUPS.map(group => (
          <CommandGroup key={group.id} heading={group.label}>
            {EDITOR_COMMANDS.filter(command => command.group === group.id).map(command => {
              const Icon = command.icon;
              const label = getEditorCommandLabel(command, context);
              const availability = getEditorCommandAvailability(command, context);
              const active = command.kind === 'tool' && command.id === activeTool;
              return (
                <CommandItem
                  key={command.id}
                  value={`${label} ${command.help} ${command.aliases.join(' ')}`}
                  keywords={[...command.aliases]}
                  disabled={!availability.available}
                  aria-label={availability.available ? label : `${label}, unavailable: ${availability.reason}`}
                  onSelect={() => {
                    if (!availability.available) return;
                    onRunCommand(command.id);
                    onOpenChange(false);
                  }}
                >
                  <Icon className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-medium">
                      {label}
                      {active ? <span className="text-xs text-primary">Active</span> : null}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {availability.available ? command.help : `Unavailable — ${availability.reason}`}
                    </span>
                  </span>
                  {active ? <Check className="ml-2 h-4 w-4 text-primary" aria-hidden="true" /> : null}
                  {command.shortcut ? <CommandShortcut>{command.shortcut}</CommandShortcut> : null}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
      <div className="flex items-center gap-2 border-t px-3 py-2 text-xs text-slate-500">
        <Search className="h-3.5 w-3.5" aria-hidden="true" />
        Search also understands tested beginner terms such as pointer, opening, flip and space evenly.
      </div>
    </CommandDialog>
  );
}
