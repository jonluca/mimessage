import fs from "fs-extra";
import path from "path";
import prettier from "prettier";
import parserTypescript from "prettier/parser-typescript";
import { fileURLToPath } from "url";
import { dirname } from "path";
import jetpack from "fs-jetpack";
import { execa } from "execa";
import packageJson from "../package.json" assert { type: "json" };
import * as os from "os";
import SqliteDb from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appPath = packageJson.build.appId;
const prettierOptions: prettier.Options = {
  parser: "typescript",
  plugins: [parserTypescript],
  printWidth: 120,
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
  const out = await execa(`DATABASE_URL="${dbDir}" yarn kysely-codegen`, { shell: true });
  console.log(out.stdout);
  console.log(out.stderr);
  const typeStr = await fs.readFile("node_modules/kysely-codegen/dist/db.d.ts", "utf8");
  await fs.writeFile(path.join(dir, filename), prettier.format(typeStr, prettierOptions));

  try {
    const embeddins = await execa(`DATABASE_URL="${embeddingDbDir}" yarn kysely-codegen`, { shell: true });
    console.log(embeddins.stdout);
    console.log(embeddins.stderr);
    const typeStrEmbedding = await fs.readFile("node_modules/kysely-codegen/dist/db.d.ts", "utf8");
    await fs.writeFile(path.join(dir, filenameEmbedding), prettier.format(typeStrEmbedding, prettierOptions));
  } catch (e) {
    console.log(e);
  }
};

try {
  await run();
} catch (e) {
  console.log("Rebuilding binaries for arch...");
  await execa(`npm rebuild better-sqlite3 --update-binary`, { shell: true });
  console.log("Done rebuilding binaries");
  await run();
}
process.exit(0);
