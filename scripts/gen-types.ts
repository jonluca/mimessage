import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import jetpack from "fs-jetpack";
import { execa } from "execa";
import { format } from "oxfmt";
import packageJson from "../package.json" with { type: "json" };
import * as os from "os";
import SqliteDb from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appPath = packageJson.build.appId;

const formatTypes = async (fileName: string, sourceText: string) => {
  const result = await format(fileName, sourceText, {
    arrowParens: "always",
    printWidth: 120,
    semi: true,
    tabWidth: 2,
    trailingComma: "all",
  });

  if (result.errors.length > 0) {
    throw new Error(`Could not format ${fileName}: ${JSON.stringify(result.errors)}`);
  }

  return result.code;
};

const libDir = path.join(os.homedir(), "Library");
const dbDir = path.join(libDir, "Application Support", appPath, "db.sqlite");
const embeddingDbDir = path.join(libDir, "Application Support", appPath, "embeddings.sqlite");

const filename = "types.d.ts";
const filenameEmbedding = "embeddings-db.d.ts";

if (!(await jetpack.existsAsync(dbDir))) {
  await jetpack.copy(path.join(libDir, "/Messages/chat.db"), dbDir, { overwrite: false });
}
console.log(dbDir);
const run = async () => {
  if (!(await fs.pathExists(dbDir))) {
    console.log("Database does not exist - make sure you run the app at least once before running this script.");
    return;
  }
  const sqliteDb = new SqliteDb(dbDir);
  await sqliteDb.exec("CREATE VIRTUAL TABLE IF NOT EXISTS message_fts USING fts5(text,message_id)");
  const exists = sqliteDb.prepare("SELECT message_id FROM message_fts limit 1").pluck().get();
  if (exists === undefined) {
    await sqliteDb.exec("INSERT INTO message_fts SELECT text, ROWID as message_id FROM message");
  }

  const dir = path.join(__dirname, "../_generated");
  const out = await execa("yarn", ["kysely-codegen"], { env: { DATABASE_URL: dbDir } });
  console.log(out.stdout);
  console.log(out.stderr);
  const typeStr = await fs.readFile("node_modules/kysely-codegen/dist/db.d.ts", "utf8");
  await fs.writeFile(path.join(dir, filename), await formatTypes(filename, typeStr));

  try {
    const embeddins = await execa("yarn", ["kysely-codegen"], { env: { DATABASE_URL: embeddingDbDir } });
    console.log(embeddins.stdout);
    console.log(embeddins.stderr);
    const typeStrEmbedding = await fs.readFile("node_modules/kysely-codegen/dist/db.d.ts", "utf8");
    await fs.writeFile(path.join(dir, filenameEmbedding), await formatTypes(filenameEmbedding, typeStrEmbedding));
  } catch (e) {
    console.log(e);
  }
};

let rebuiltForNode = false;

try {
  try {
    await run();
  } catch {
    rebuiltForNode = true;
    console.log("Rebuilding binaries for the host Node.js runtime...");
    await execa("npm", ["rebuild", "better-sqlite3", "--update-binary"]);
    console.log("Done rebuilding binaries");
    await run();
  }
} finally {
  if (rebuiltForNode) {
    console.log("Restoring native modules for Electron...");
    await execa("yarn", ["postinstall"], { stdio: "inherit" });
  }
}
process.exit(0);
