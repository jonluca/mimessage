import { constants } from "node:fs";
import { copyFile, cp, lstat, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import path from "node:path";

interface StagedExportPaths {
  filePath: string;
  attachmentsPath?: string;
}

export const copyExportAttachment = async (source: string, destination: string) => {
  // A previous export may contain a symlink. Replace the entry itself before
  // copying so refreshing that attachment cannot write through the link.
  await rm(destination, { force: true });
  await copyFile(source, destination, constants.COPYFILE_EXCL);
};

/** Build the complete export before replacing either existing output. */
export const writeStagedExport = async (
  filePath: string,
  includeAttachments: boolean,
  write: (paths: StagedExportPaths) => Promise<void>,
) => {
  const directory = path.dirname(filePath);
  const stageRoot = await mkdtemp(path.join(directory, ".mimessage-export-"));
  const stagedFile = path.join(stageRoot, "transcript");
  const stagedAttachments = includeAttachments ? path.join(stageRoot, "attachments") : undefined;
  const attachmentsDestination = path.join(directory, `${path.parse(filePath).name}-attachments`);
  const outputs = [
    { staged: stagedFile, destination: filePath, backup: path.join(stageRoot, "previous-transcript") },
    ...(stagedAttachments
      ? [
          {
            staged: stagedAttachments,
            destination: attachmentsDestination,
            backup: path.join(stageRoot, "previous-attachments"),
          },
        ]
      : []),
  ].map((output) => ({ ...output, backedUp: false, installed: false }));
  let preserveBackup = false;

  try {
    if (stagedAttachments) {
      const existing = await lstat(attachmentsDestination).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") {
          throw error;
        }
        return null;
      });
      if (existing) {
        if (!existing.isDirectory()) {
          throw new Error("The export attachments destination must be a directory");
        }
        // Keep earlier attachments even when Messages no longer has the source
        // file, together with anything the user added to the export directory.
        await cp(attachmentsDestination, stagedAttachments, {
          recursive: true,
          dereference: false,
          verbatimSymlinks: true,
        });
      } else {
        await mkdir(stagedAttachments);
      }
    }
    await write({ filePath: stagedFile, attachmentsPath: stagedAttachments });

    try {
      for (const output of outputs) {
        try {
          await rename(output.destination, output.backup);
          output.backedUp = true;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            throw error;
          }
        }
        await rename(output.staged, output.destination);
        output.installed = true;
      }
    } catch (error) {
      const restorationErrors: unknown[] = [];
      for (const output of outputs.toReversed()) {
        try {
          if (output.installed) {
            await rm(output.destination, { recursive: true, force: true });
          }
          if (output.backedUp) {
            await rename(output.backup, output.destination);
          }
        } catch (restorationError) {
          restorationErrors.push(restorationError);
        }
      }
      if (restorationErrors.length) {
        preserveBackup = true;
        throw new AggregateError(
          [error, ...restorationErrors],
          `Export replacement failed. Previous output is retained in ${stageRoot}`,
        );
      }
      throw error;
    }
  } finally {
    if (!preserveBackup) {
      await rm(stageRoot, { recursive: true, force: true });
    }
  }
};
