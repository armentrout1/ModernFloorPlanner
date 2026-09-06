import type { Express } from "express";
import { createServer, type Server } from "http";
import type { IStorage } from "./storage";
import {
  createLegacyFloorPlanSchema,
  updateLegacyFloorPlanSchema,
  floorPlanIdSchema,
} from "@shared/legacyValidation";

export type FloorPlanStorage = Pick<IStorage,
  "getFloorPlans" | "getFloorPlan" | "createFloorPlan" | "updateFloorPlan" | "deleteFloorPlan"
>;

export async function registerRoutes(app: Express, planStorage?: FloorPlanStorage): Promise<Server> {
  // The normal application still uses DatabaseStorage. An injected adapter lets
  // regression tests exercise these HTTP routes without connecting to live data.
  const storage = planStorage ?? (await import("./storage")).storage;

  app.get('/api/floor-plans', async (_req, res) => {
    try {
      const floorPlans = await storage.getFloorPlans();
      res.json(floorPlans);
    } catch {
      res.status(500).json({ message: 'Failed to fetch floor plans' });
    }
  });

  app.post('/api/floor-plans', async (req, res) => {
    const input = createLegacyFloorPlanSchema.safeParse(req.body);
    if (!input.success) {
      return res.status(400).json({
        message: 'Invalid floor plan',
        issues: input.error.issues.map(({ path, message }) => ({ path, message })),
      });
    }
    try {
      const floorPlan = await storage.createFloorPlan(input.data);
      res.status(201).json(floorPlan);
    } catch {
      res.status(500).json({ message: 'Failed to create floor plan' });
    }
  });

  app.get('/api/floor-plans/:id', async (req, res) => {
    const id = floorPlanIdSchema.safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ message: 'Invalid floor plan ID' });
    try {
      const floorPlan = await storage.getFloorPlan(id.data);
      if (!floorPlan) {
        return res.status(404).json({ message: 'Floor plan not found' });
      }
      res.json(floorPlan);
    } catch {
      res.status(500).json({ message: 'Failed to fetch floor plan' });
    }
  });

  app.patch('/api/floor-plans/:id', async (req, res) => {
    const id = floorPlanIdSchema.safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ message: 'Invalid floor plan ID' });
    const input = updateLegacyFloorPlanSchema.safeParse(req.body);
    if (!input.success) {
      return res.status(400).json({
        message: 'Invalid floor plan',
        issues: input.error.issues.map(({ path, message }) => ({ path, message })),
      });
    }
    try {
      const updatedFloorPlan = await storage.updateFloorPlan(id.data, input.data);
      if (!updatedFloorPlan) {
        return res.status(404).json({ message: 'Floor plan not found' });
      }
      res.json(updatedFloorPlan);
    } catch {
      res.status(500).json({ message: 'Failed to update floor plan' });
    }
  });

  app.delete('/api/floor-plans/:id', async (req, res) => {
    const id = floorPlanIdSchema.safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ message: 'Invalid floor plan ID' });
    try {
      const success = await storage.deleteFloorPlan(id.data);
      if (!success) {
        return res.status(404).json({ message: 'Floor plan not found' });
      }
      res.status(204).end();
    } catch {
      res.status(500).json({ message: 'Failed to delete floor plan' });
    }
  });

  return createServer(app);
}
