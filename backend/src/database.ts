import mongoose from "mongoose";
import { config } from "./config.js";
import { logger } from "./logger.js";

export async function connectDatabase() {
  await mongoose.connect(config.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  logger.info("MongoDB connection established");
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}

export function databaseHealth() {
  const states: Record<number, string> = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
  };
  const state = states[mongoose.connection.readyState] ?? "unknown";
  return { status: state === "connected" ? "ok" : "unavailable", state };
}
