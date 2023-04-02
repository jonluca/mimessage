import * as process from "process";

/**
 * Write to the CLI while something is working so that we can overwrite it later
 *
 * Example:
 *
 * processing();
 * console.log("Done working!");
 */
export function processing() {
  process.stdout.write("\rProcessing...");
}

/**
 * Overwrite the CLI when something is done working so that we can write cleanly later
 *
 * Example:
 *
 * processing();
 * doneProcessing();
 */
export function doneProcessing() {
  process.stdout.write("\r");
}