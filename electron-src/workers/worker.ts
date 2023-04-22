import type { SQLDatabase } from "../data/database";
import db from "../data/database";
import { expose } from "electron-worker-threads/worker";

const exposed: Partial<Record<Partial<keyof SQLDatabase>, any>> = {};
for (const property in db) {
  const prop = property as keyof SQLDatabase;
  const dbElement = db[prop];
  if (typeof dbElement === "function") {
    exposed[prop] = dbElement;
  }
}

expose(exposed);
