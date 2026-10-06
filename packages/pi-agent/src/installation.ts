import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// Keep this outside auth.json so signing out never changes the installation ID.
export function getInstallationId(directory: string): string {
  const file = path.join(directory, "installation-id");
  let id: string;
  try {
    id = readFileSync(file, "utf8").trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    mkdirSync(directory, { recursive: true });
    id = randomUUID();
    try {
      writeFileSync(file, id, { flag: "wx", mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      id = readFileSync(file, "utf8").trim();
    }
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("The saved installation ID is invalid.");
  }
  return id;
}
