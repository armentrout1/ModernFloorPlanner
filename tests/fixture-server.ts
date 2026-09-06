// Disposable loopback-only acceptance server. Never imports DB config or customer records.
import express from 'express';
import path from 'node:path';
import { registerRoutes } from '../server/routes';
import { httpErrorHandler } from '../server/httpErrors';
import type { FloorPlan, InsertFloorPlan } from '../shared/schema';

const plans = new Map<number, FloorPlan>();
let nextId = 1;
const storage = {
  async getFloorPlans() { return [...plans.values()]; },
  async getFloorPlan(id: number) { return plans.get(id); },
  async createFloorPlan(input: InsertFloorPlan) {
    const plan = { ...structuredClone(input), id: nextId++ } as FloorPlan;
    plans.set(plan.id, plan); return plan;
  },
  async updateFloorPlan(id: number, input: Partial<InsertFloorPlan>) {
    const previous = plans.get(id); if (!previous) return undefined;
    const plan = { ...previous, ...structuredClone(input) };
    plans.set(id, plan); return plan;
  },
  async deleteFloorPlan(id: number) { return plans.delete(id); },
};
const app = express();
app.use(express.json());
const server = await registerRoutes(app, storage);
const publicPath = path.resolve('dist/public');
app.use(express.static(publicPath));
app.get('*', (_req, res) => res.sendFile(path.join(publicPath, 'index.html')));
app.use(httpErrorHandler);
server.listen(4173, '127.0.0.1', () => console.log('Disposable M1 fixture listening on loopback:4173'));
