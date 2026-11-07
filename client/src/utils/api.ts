import { FloorPlan } from '@shared/schema';
import { Room } from './types';
import { apiRequest, ApiError } from '@/lib/queryClient';
import { AccountContextChanged, WorkspaceContextRequired, captureRequestContext, type RequestContext } from '@/features/account/runtime';

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

// No workspace is inferred here. The account/workspace integration must provide
// an explicit selection; the server still verifies current membership.
export const isSketchAccessError = (error: unknown): boolean =>
  error instanceof AccountContextChanged || error instanceof ApiError && [401, 403, 404, 409, 503].includes(error.status);

export const sketchErrorMessage = (error: unknown): string => {
  if (error instanceof AccountContextChanged || error instanceof WorkspaceContextRequired) return error.message;
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Sign in is required to access saved plans. Your local drawing is unchanged.';
    if (error.status === 403) return 'You do not have permission to access these saved plans. Your local drawing is unchanged.';
    if (error.status === 503) return 'Saved plans are unavailable. Your local drawing and unfinished input are unchanged.';
    if (error.status === 400) return 'The server could not accept this request. An authorized workspace selection is required for saved plans.';
    if (error.status === 404) return 'This saved plan is unavailable. Your local drawing is unchanged.';
  }
  return 'The plan request failed. Your local drawing and unfinished input are unchanged. Try again.';
};

export const fetchSavedSketches = async (): Promise<SavedSketch[]> => {
  const response = await apiRequest('GET', '/api/floor-plans');
  return ((await response.json()) as FloorPlan[]).map(floorPlanToSavedSketch)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
};

export const fetchSketch = async (id: number, context?: RequestContext): Promise<SavedSketch> => {
  const response = await apiRequest('GET', `/api/floor-plans/${id}`, undefined, context);
  return floorPlanToSavedSketch(await response.json());
};

export const saveSketch = async (name: string, rooms: Room[], id?: number): Promise<SavedSketch> => {
  const context = await captureRequestContext();
  const existing = id ? await fetchSketch(id, context) : null;
  const data = savedSketchToFloorPlan({ name, rooms }, existing?.createdAt);
  const response = await apiRequest(id ? 'PATCH' : 'POST', id ? `/api/floor-plans/${id}` : '/api/floor-plans', data, context);
  return floorPlanToSavedSketch(await response.json());
};

export const deleteSketch = async (id: number): Promise<boolean> => {
  await apiRequest('DELETE', `/api/floor-plans/${id}`);
  return true;
};

export const renameSketch = async (id: number, newName: string): Promise<SavedSketch> => {
  const response = await apiRequest('PATCH', `/api/floor-plans/${id}`, {
    name: newName, updatedAt: new Date().toISOString(),
  });
  return floorPlanToSavedSketch(await response.json());
};

export const duplicateSketch = async (id: number): Promise<SavedSketch> => {
  const context = await captureRequestContext();
  const source = await fetchSketch(id, context);
  const data = savedSketchToFloorPlan({ name: `${source.name.slice(0, 195)} copy`, rooms: source.rooms });
  const response = await apiRequest('POST', '/api/floor-plans', data, context);
  return floorPlanToSavedSketch(await response.json());
};
