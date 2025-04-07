import { Room } from './types';

// Interface for a saved sketch
export interface SavedSketch {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  rooms: Room[];
}

// Storage key in localStorage
const STORAGE_KEY = 'modern_floor_planner_sketches';

// Get all sketches from storage
export const getSavedSketches = (): SavedSketch[] => {
  try {
    const sketches = localStorage.getItem(STORAGE_KEY);
    return sketches ? JSON.parse(sketches) : [];
  } catch (error) {
    console.error('Error loading sketches:', error);
    return [];
  }
};

// Save all sketches to storage
const saveSketches = (sketches: SavedSketch[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sketches));
  } catch (error) {
    console.error('Error saving sketches:', error);
  }
};

// Save a new sketch or update an existing one
export const saveSketch = (name: string, rooms: Room[], id?: string): SavedSketch => {
  const sketches = getSavedSketches();
  const now = new Date().toISOString();
  
  // If an id is provided, look for existing sketch to update
  if (id) {
    const existingIndex = sketches.findIndex(sketch => sketch.id === id);
    
    if (existingIndex >= 0) {
      // Update existing sketch
      const updatedSketch: SavedSketch = {
        ...sketches[existingIndex],
        name,
        updatedAt: now,
        rooms: [...rooms], // Clone rooms array
      };
      
      sketches[existingIndex] = updatedSketch;
      saveSketches(sketches);
      return updatedSketch;
    }
  }
  
  // Create a new sketch
  const newSketch: SavedSketch = {
    id: id || generateId(),
    name,
    createdAt: now,
    updatedAt: now,
    rooms: [...rooms], // Clone rooms array
  };
  
  sketches.push(newSketch);
  saveSketches(sketches);
  return newSketch;
};

// Load a sketch by ID
export const loadSketch = (id: string): SavedSketch | null => {
  const sketches = getSavedSketches();
  return sketches.find(sketch => sketch.id === id) || null;
};

// Delete a sketch by ID
export const deleteSketch = (id: string): boolean => {
  const sketches = getSavedSketches();
  const filteredSketches = sketches.filter(sketch => sketch.id !== id);
  
  if (filteredSketches.length < sketches.length) {
    saveSketches(filteredSketches);
    return true;
  }
  
  return false;
};

// Rename a sketch
export const renameSketch = (id: string, newName: string): SavedSketch | null => {
  const sketches = getSavedSketches();
  const sketchIndex = sketches.findIndex(sketch => sketch.id === id);
  
  if (sketchIndex >= 0) {
    sketches[sketchIndex] = {
      ...sketches[sketchIndex],
      name: newName,
      updatedAt: new Date().toISOString(),
    };
    
    saveSketches(sketches);
    return sketches[sketchIndex];
  }
  
  return null;
};

// Generate a unique ID for new sketches
const generateId = (): string => {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
};