import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronsUpDown } from 'lucide-react';

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
          
          <div className="relative">
            <Button
              className="h-6 w-6 p-0 bg-white/70 hover:bg-white border border-gray-300 rounded"
              onClick={(e) => {
                e.stopPropagation();
                // Show dropdown menu with room names
                const menu = document.getElementById(`room-name-dropdown-${name}`);
                if (menu) {
                  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
                }
              }}
            >
              <ChevronsUpDown className="h-3 w-3" />
            </Button>
            
            <div 
              id={`room-name-dropdown-${name}`} 
              className="absolute mt-1 max-h-60 w-[200px] right-0 overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none text-sm z-50"
              style={{ display: 'none' }}
            >
              {commonRoomNames.map((room) => (
                <div
                  key={room.value}
                  className="relative cursor-pointer select-none py-2 pl-10 pr-4 hover:bg-blue-100 hover:text-blue-900 text-gray-900"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectRoomName(room.value);
                    // Hide dropdown after selection
                    const menu = document.getElementById(`room-name-dropdown-${name}`);
                    if (menu) {
                      menu.style.display = 'none';
                    }
                  }}
                >
                  <span className={`block truncate ${room.value === value ? 'font-medium' : 'font-normal'}`}>
                    {room.label}
                  </span>
                  {room.value === value && (
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-blue-600">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <span>{name || 'Room'}</span>
      )}
    </div>
  );
};

export default RoomLabel;