import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";

export async function registerRoutes(app: Express): Promise<Server> {
  // API Routes for floor plans
  app.get('/api/floor-plans', async (req, res) => {
    try {
      const floorPlans = await storage.getFloorPlans();
      res.json(floorPlans);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch floor plans' });
    }
  });

  app.post('/api/floor-plans', async (req, res) => {
    try {
      const floorPlan = await storage.createFloorPlan(req.body);
      res.status(201).json(floorPlan);
    } catch (error) {
      res.status(400).json({ message: 'Failed to create floor plan' });
    }
  });

  app.get('/api/floor-plans/:id', async (req, res) => {
    try {
      const floorPlan = await storage.getFloorPlan(parseInt(req.params.id));
      if (!floorPlan) {
        return res.status(404).json({ message: 'Floor plan not found' });
      }
      res.json(floorPlan);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch floor plan' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
