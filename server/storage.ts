import { 
  users, 
  type User, 
  type InsertUser,
  floorPlans,
  type FloorPlan,
  type InsertFloorPlan,
  type Room
} from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Floor plan methods
  getFloorPlans(): Promise<FloorPlan[]>;
  getFloorPlan(id: number): Promise<FloorPlan | undefined>;
  createFloorPlan(floorPlan: InsertFloorPlan): Promise<FloorPlan>;
  updateFloorPlan(id: number, updates: Partial<InsertFloorPlan>): Promise<FloorPlan | undefined>;
  deleteFloorPlan(id: number): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }
  
  // Floor plan methods
  async getFloorPlans(): Promise<FloorPlan[]> {
    return await db.select().from(floorPlans).orderBy(floorPlans.updatedAt);
  }
  
  async getFloorPlan(id: number): Promise<FloorPlan | undefined> {
    const [floorPlan] = await db.select().from(floorPlans).where(eq(floorPlans.id, id));
    return floorPlan;
  }
  
  async createFloorPlan(floorPlan: InsertFloorPlan): Promise<FloorPlan> {
    const [createdFloorPlan] = await db
      .insert(floorPlans)
      .values(floorPlan)
      .returning();
    return createdFloorPlan;
  }
  
  async updateFloorPlan(id: number, updates: Partial<InsertFloorPlan>): Promise<FloorPlan | undefined> {
    const [updatedFloorPlan] = await db
      .update(floorPlans)
      .set(updates)
      .where(eq(floorPlans.id, id))
      .returning();
    return updatedFloorPlan;
  }
  
  async deleteFloorPlan(id: number): Promise<boolean> {
    const result = await db
      .delete(floorPlans)
      .where(eq(floorPlans.id, id))
      .returning({ id: floorPlans.id });
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();
