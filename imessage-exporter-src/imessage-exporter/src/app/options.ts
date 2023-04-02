import { homedir } from 'os';
import * as path from 'path';
import { Command } from 'commander';
import { QueryContext } from 'imessage-database/util/query-context';

// Constants
const DEFAULT_OUTPUT_DIR = 'imessage_export';

const OPTION_DB_PATH = 'db-path';
const OPTION_COPY = 'no-copy';
const OPTION_DIAGNOSTIC = 'diagnostics';
const OPTION_EXPORT_TYPE = 'format';
const OPTION_EXPORT_PATH = 'export-path';
const OPTION_START_DATE = 'start-date';
const OPTION_END_DATE = 'end-date';
const OPTION_DISABLE_LAZY_LOADING = 'no-lazy';
const OPTION_CUSTOM_NAME = 'custom-name';

const SUPPORTED_FILE_TYPES = 'txt, html';

interface Options {
  dbPath: string;
  noCopy: boolean;
  diagnostic: boolean;
  exportType?: string;
  exportPath: string;
  queryContext: QueryContext;
  noLazy: boolean;
  customName?: string;
}

function defaultDbPath() {
  return path.join(homedir(), 'Library', 'Messages', 'chat.db');
}

function validatePath(exportPath?: string, exportType?: string) {
  const resolvedPath = path.resolve(exportPath || path.join(homedir(), DEFAULT_OUTPUT_DIR));
  if (exportType) {
    if (fs.existsSync(resolvedPath)) {
      const existingFiles = fs.readdirSync(resolvedPath);
      if (existingFiles.some((file) => path.extname(file) === `.${exportType}`)) {
        throw new Error(`Specified export path ${resolvedPath} contains existing "${exportType}" export data!`);
      }
    }
  }

  return resolvedPath;
}

function fromCommandLine(): Options {
  const program = new Command();

  program
    .requiredOption('-p, --db-path <path>', 'Specify a custom path for the iMessage database file', defaultDbPath())
    .option('-n, --no-copy', 'Do not copy attachments, instead reference them in-place')
    .option('-d, --diagnostics', 'Print diagnostic information and exit')
    .option('-f, --format <format>', `Specify a single file format to export messages into, supported formats are: ${SUPPORTED_FILE_TYPES}`)
    .option('-o, --export-path <path>', 'Specify a custom directory for outputting exported data')
    .option('-s, --start-date <date>', 'The start date filter. Only messages sent on or after this date will be included')
    .option('-e, --end-date <date>', 'The end date filter. Only messages sent before this date will be included')
    .option('-l, --no-lazy', 'Do not include `loading="lazy"` in HTML export `img` tags')
    .option('-m, --custom-name <name>', "Specify an optional custom name for the database owner's messages in exports");

  program.parse(process.argv);

  const args = program.opts();

  // Build query context
  const queryContext = new QueryContext();
  if (args.startDate) {
    queryContext.setStart(args.startDate);
  }
  if (args.endDate) {
    queryContext.setEnd(args.endDate);
  }

  return {
    dbPath: args.dbPath,
    noCopy: args.noCopy || false,
    diagnostic: args.diagnostics || false,
    exportType: args.format,
    exportPath: validatePath(args.exportPath, args.format),
    queryContext,
    noLazy: args.noLazy || false,
    customName: args.customName,
  };
}

export { Options, fromCommandLine };