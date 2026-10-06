import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getInstallationId } from "../../../packages/pi-agent/src/installation";

test("installation UUID survives restart and differs between installations", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "side-installation-"));
  try {
    const first = path.join(directory, "first");
    const id = getInstallationId(first);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(getInstallationId(first)).toBe(id);
    expect(getInstallationId(path.join(directory, "second"))).not.toBe(id);
    expect(statSync(path.join(first, "installation-id")).mode & 0o777).toBe(0o600);
    writeFileSync(path.join(first, "installation-id"), "invalid");
    expect(() => getInstallationId(first)).toThrow("saved installation ID is invalid");
    expect(readFileSync(path.join(first, "installation-id"), "utf8")).toBe("invalid");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
