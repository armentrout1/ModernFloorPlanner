import React, { useState, useEffect, useRef } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

// Common room names that people might want to use
const commonRoomNames = [
  { label: 'Living Room', value: 'Living Room' },
  { label: 'Kitchen', value: 'Kitchen' },
  { label: 'Dining Room', value: 'Dining Room' },
  { label: 'Master Bedroom', value: 'Master Bedroom' },
  { label: 'Bedroom', value: 'Bedroom' },
  { label: 'Bathroom', value: 'Bathroom' },
  { label: 'Office', value: 'Office' },
  { label: 'Study', value: 'Study' },
  { label: 'Hallway', value: 'Hallway' },
  { label: 'Entryway', value: 'Entryway' },
  { label: 'Foyer', value: 'Foyer' },
  { label: 'Laundry Room', value: 'Laundry Room' },
  { label: 'Garage', value: 'Garage' },
  { label: 'Pantry', value: 'Pantry' },
  { label: 'Closet', value: 'Closet' },
  { label: 'Utility Room', value: 'Utility Room' },
  { label: 'Mudroom', value: 'Mudroom' },
  { label: 'Guest Room', value: 'Guest Room' },
  { label: 'Den', value: 'Den' },
  { label: 'Family Room', value: 'Family Room' },
];

interface RoomLabelProps {
  name: string;
  isEditing: boolean;
  onStartEdit: () => void;
  onSave: (newName: string) => void;
}

const RoomLabel: React.FC<RoomLabelProps> = ({
  name,
  isEditing,
  onStartEdit,
  onSave,
}) => {
  const [value, setValue] = useState(name);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);
  
  // Update local value when name prop changes
  useEffect(() => {
    setValue(name);
  }, [name]);
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSave(value);
    } else if (e.key === 'Escape') {
      setValue(name); // Reset to original value
      onSave(name);
    }
  };
  
  const handleBlur = () => {
    if (!open) {
      onSave(value);
    }
  };
  
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isEditing) {
      onStartEdit();
    }
  };

  const handleSelectRoomName = (selectedValue: string) => {
    setValue(selectedValue);
    setOpen(false);
    onSave(selectedValue);
  };
  
  return (
    <div
      className="bg-white bg-opacity-80 px-2 py-0.5 rounded text-sm font-medium"
      onClick={handleClick}
    >
      {isEditing ? (
        <div className="flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            className="w-full text-center bg-transparent outline-none border-b border-blue-400 mr-1"
            onClick={(e) => e.stopPropagation()}
          />
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                aria-label="Select room type"
                className="h-6 w-6 p-0 bg-white/70 hover:bg-white"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(!open);
                }}
              >
                <ChevronsUpDown className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0">
              <Command>
                <CommandInput placeholder="Search room types..." className="h-8" />
                <CommandEmpty>No room type found.</CommandEmpty>
                <CommandGroup className="max-h-[200px] overflow-auto">
                  {commonRoomNames.map((room) => (
                    <CommandItem
                      key={room.value}
                      value={room.value}
                      onSelect={() => handleSelectRoomName(room.value)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === room.value ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {room.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      ) : (
        <span>{name || 'Room'}</span>
      )}
    </div>
  );
};

export default RoomLabel;