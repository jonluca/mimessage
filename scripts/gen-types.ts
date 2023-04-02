import fs from "fs-extra";
import path from "path";
import prettier from "prettier";
import parserTypescript from "prettier/parser-typescript";
import { fileURLToPath } from "url";
import { dirname } from "path";
import jetpack from "fs-jetpack";
import { execa } from "execa";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const prettierOptions: prettier.Options = {
  parser: "typescript",
  plugins: [parserTypescript],
  printWidth: 120,
};

const messagesDb = process.env.HOME + "/Library/Messages/chat.db";
const tmpDir = jetpack.tmpDir();
const tmpMessagesDb = tmpDir.path("Messages");

await jetpack.copy(messagesDb, tmpMessagesDb, { overwrite: true });
console.log(tmpMessagesDb);
const run = async (dbPath: string, filename: string) => {
  if (!(await fs.pathExists(dbPath))) {
    console.log("Database does not exist - make sure you run the recorder at least once before running this script.");
    return;
  }

  const dir = path.join(__dirname, "../_generated");
  const out = await execa(`DATABASE_URL="${dbPath}" yarn kysely-codegen`, { shell: true });
  console.log(out.stdout);
  console.log(out.stderr);
  const typeStr = await fs.readFile("node_modules/kysely-codegen/dist/db.d.ts", "utf8");
  await fs.writeFile(path.join(dir, filename), prettier.format(typeStr, prettierOptions));
};
try {
  await run(messagesDb, "types.d.ts");
} catch (e) {
  await execa(`npm rebuild better-sqlite3 --update-binary`, { shell: true });
  await run(messagesDb, "types.d.ts");
}
tmpDir.remove();
process.exit(0);
