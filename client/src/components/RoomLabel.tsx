import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { CheckIcon, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

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
    // Short delay to allow selection from dropdown
    setTimeout(() => {
      onSave(value);
    }, 100);
  };
  
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isEditing) {
      onStartEdit();
    }
  };

  const handleSelectRoomName = (selectedValue: string) => {
    setValue(selectedValue);
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
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                variant="outline"
                size="icon"
                className="h-6 w-6 p-0 bg-white/70 hover:bg-white border border-gray-200 rounded-sm"
              >
                <ChevronsUpDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent 
              align="end" 
              className="max-h-52 overflow-y-auto w-40"
              onClick={(e) => e.stopPropagation()}
            >
              {commonRoomNames.map((room) => (
                <DropdownMenuItem
                  key={room.value}
                  className={cn(
                    "flex items-center gap-2 cursor-pointer",
                    value === room.value && "bg-primary/10 font-medium"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectRoomName(room.value);
                  }}
                >
                  {value === room.value ? (
                    <CheckIcon className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <span className="w-3.5" />
                  )}
                  {room.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : (
        <span>{name || 'Room'}</span>
      )}
    </div>
  );
};

export default RoomLabel;