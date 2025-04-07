import { FloorPlan } from '@shared/schema';
import { Room } from './types';
import { apiRequest } from '@/lib/queryClient';

export interface SavedSketch {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  rooms: Room[];
}

// Convert backend FloorPlan to frontend SavedSketch
export const floorPlanToSavedSketch = (floorPlan: FloorPlan): SavedSketch => {
  return {
    id: floorPlan.id,
    name: floorPlan.name,
    createdAt: floorPlan.createdAt,
    updatedAt: floorPlan.updatedAt,
    rooms: floorPlan.rooms as Room[],
  };
};

// Convert frontend SavedSketch to backend FloorPlan
export const savedSketchToFloorPlan = (
  sketch: { name: string; rooms: Room[] },
  createdAt?: string, 
  updatedAt?: string
) => {
  const now = new Date().toISOString();
  return {
    name: sketch.name,
    rooms: sketch.rooms,
    createdAt: createdAt || now,
    updatedAt: updatedAt || now,
  };
};

// API functions
export const fetchSavedSketches = async (): Promise<SavedSketch[]> => {
  try {
    const response = await apiRequest('GET', '/api/floor-plans');
    const floorPlans = (await response.json()) as FloorPlan[];
    return floorPlans.map(floorPlanToSavedSketch);
  } catch (error) {
    console.error('Failed to fetch sketches:', error);
    return [];
  }
};

export const fetchSketch = async (id: number): Promise<SavedSketch | null> => {
  try {
    const response = await apiRequest('GET', `/api/floor-plans/${id}`);
    const floorPlan = (await response.json()) as FloorPlan;
    return floorPlanToSavedSketch(floorPlan);
  } catch (error) {
    console.error(`Failed to fetch sketch with id ${id}:`, error);
    return null;
  }
};

export const saveSketch = async (
  name: string,
  rooms: Room[],
  id?: number
): Promise<SavedSketch> => {
  try {
    if (id) {
      // Update existing sketch
      const sketch = await fetchSketch(id);
      if (!sketch) {
        throw new Error(`Sketch with id ${id} not found`);
      }
      
      const updatedData = savedSketchToFloorPlan(
        { name, rooms },
        sketch.createdAt,
        new Date().toISOString()
      );
      
      const response = await apiRequest(
        'PATCH',
        `/api/floor-plans/${id}`,
        updatedData
      );
      
      const updatedFloorPlan = (await response.json()) as FloorPlan;
      return floorPlanToSavedSketch(updatedFloorPlan);
    } else {
      // Create new sketch
      const newSketchData = savedSketchToFloorPlan({ name, rooms });
      
      const response = await apiRequest(
        'POST',
        '/api/floor-plans',
        newSketchData
      );
      
      const newFloorPlan = (await response.json()) as FloorPlan;
      return floorPlanToSavedSketch(newFloorPlan);
    }
  } catch (error) {
    console.error('Failed to save sketch:', error);
    throw error;
  }
};

export const deleteSketch = async (id: number): Promise<boolean> => {
  try {
    await apiRequest('DELETE', `/api/floor-plans/${id}`);
    return true;
  } catch (error) {
    console.error(`Failed to delete sketch with id ${id}:`, error);
    return false;
  }
};

export const renameSketch = async (id: number, newName: string): Promise<SavedSketch | null> => {
  try {
    const sketch = await fetchSketch(id);
    if (!sketch) {
      throw new Error(`Sketch with id ${id} not found`);
    }
    
    const updateData = {
      name: newName,
      updatedAt: new Date().toISOString(),
    };
    
    const response = await apiRequest(
      'PATCH',
      `/api/floor-plans/${id}`,
      updateData
    );
    
    const updatedFloorPlan = (await response.json()) as FloorPlan;
    return floorPlanToSavedSketch(updatedFloorPlan);
  } catch (error) {
    console.error(`Failed to rename sketch with id ${id}:`, error);
    return null;
  }
};