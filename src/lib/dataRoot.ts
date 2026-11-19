import "server-only";
import path from "node:path";

// Read per call (not at import) so tests and the e2e server can point it at
// a scratch folder via DIRECTOR_DATA_DIR.
export function dataRoot(): string {
  return path.resolve(process.env.DIRECTOR_DATA_DIR ?? path.join(process.cwd(), ".data"));
}
