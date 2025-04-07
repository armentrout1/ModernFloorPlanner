import React, { useState, useEffect, useRef } from 'react';

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
    onSave(value);
  };
  
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isEditing) {
      onStartEdit();
    }
  };
  
  return (
    <div
      className="bg-white bg-opacity-80 px-2 py-0.5 rounded text-sm font-medium"
      onClick={handleClick}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="w-full text-center bg-transparent outline-none border-b border-blue-400"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span>{name || 'Room'}</span>
      )}
    </div>
  );
};

export default RoomLabel;