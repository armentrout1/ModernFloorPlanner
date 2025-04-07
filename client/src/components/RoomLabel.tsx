import React, { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';

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
  const [inputValue, setInputValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSave(inputValue);
    } else if (e.key === 'Escape') {
      setInputValue(name);
      onSave(name);
    }
  };

  const handleBlur = () => {
    onSave(inputValue);
  };

  if (isEditing) {
    return (
      <Input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className="py-0 h-6 text-sm w-full max-w-[120px]"
      />
    );
  }

  return (
    <span
      className="font-medium text-sm truncate cursor-pointer hover:text-primary transition-colors"
      onClick={onStartEdit}
      title="Click to edit room name"
    >
      {name || 'Unnamed Room'}
    </span>
  );
};

export default RoomLabel;