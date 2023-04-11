import type { SQLDatabase } from "./database";
import db from "./database";
import { expose } from "threads/worker";

const exposed: Partial<Record<Partial<keyof SQLDatabase>, any>> = {};
for (const property in db) {
  const prop = property as keyof SQLDatabase;
  const dbElement = db[prop];
  if (typeof dbElement === "function") {
    exposed[prop] = dbElement;
  }
}

expose(exposed);
