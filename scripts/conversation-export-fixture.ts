import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getConversationExportIds, getConversationForExport } from "../src/utils/conversation-export";
import { copyExportAttachment, writeStagedExport } from "../electron-src/utils/staged-export";

const run = async () => {
  const phoneHandle = { ROWID: 10, id: "+15550000001", contact: { parsedName: "Fixture Person" } };
  const emailHandle = { ROWID: 11, id: "fixture@example.com", contact: { parsedName: "Fixture Person" } };
  const chat = { chat_id: 1, sameParticipantChatIds: [1, 2, 2], handles: [phoneHandle] };
  const otherChat = { chat_id: 2, sameParticipantChatIds: [1, 2], handles: [emailHandle, phoneHandle] };
  const exportedChat = getConversationForExport(
    chat,
    new Map([
      [1, chat],
      [2, otherChat],
    ]),
  );
  assert.deepEqual(getConversationExportIds(exportedChat), [1, 2], "export must query every merged conversation once");
  assert.deepEqual(exportedChat.handles, [phoneHandle, emailHandle], "alternate addresses retain their contact names");
  assert.deepEqual(getConversationExportIds({ chat_id: 3 }), [3], "unmerged conversations still export normally");
  assert.throws(() => getConversationExportIds({ chat_id: 1, sameParticipantChatIds: [2, NaN] }), /Invalid/);

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mimessage-export-fixture-"));
  const filePath = path.join(directory, "conversation.json");
  const attachmentsPath = path.join(directory, "conversation-attachments");
  const attachmentName = "1-10-file.txt";
  const sourcePath = path.join(directory, "source.txt");
  const outsidePath = path.join(directory, "outside.txt");
  const exportVersion = async (version: string) =>
    writeStagedExport(filePath, true, async (staged) => {
      await fs.writeFile(staged.filePath, JSON.stringify({ version }));
      await fs.writeFile(sourcePath, version);
      await copyExportAttachment(sourcePath, path.join(staged.attachmentsPath!, attachmentName));
    });
  const assertVersion = async (version: string) => {
    assert.deepEqual(JSON.parse(await fs.readFile(filePath, "utf8")), { version });
    assert.equal(await fs.readFile(path.join(attachmentsPath, attachmentName), "utf8"), version);
  };

  try {
    await exportVersion("first");
    await assertVersion("first");
    await fs.writeFile(path.join(attachmentsPath, "retained.txt"), "older attachment still kept");
    await fs.writeFile(outsidePath, "outside must remain unchanged");
    await fs.symlink(outsidePath, path.join(attachmentsPath, "retained-link"));
    await fs.rm(path.join(attachmentsPath, attachmentName));
    await fs.symlink(outsidePath, path.join(attachmentsPath, attachmentName));
    await exportVersion("second");
    await assertVersion("second");
    assert.equal(await fs.readFile(path.join(attachmentsPath, "retained.txt"), "utf8"), "older attachment still kept");
    assert.equal(await fs.readlink(path.join(attachmentsPath, "retained-link")), outsidePath);
    assert.equal(await fs.readFile(outsidePath, "utf8"), "outside must remain unchanged");
    assert.equal((await fs.lstat(path.join(attachmentsPath, attachmentName))).isSymbolicLink(), false);

    await assert.rejects(
      writeStagedExport(filePath, true, async (staged) => {
        await fs.writeFile(staged.filePath, "incomplete replacement");
        await fs.copyFile(path.join(directory, "missing-source"), path.join(staged.attachmentsPath!, attachmentName));
      }),
      { code: "ENOENT" },
    );
    await assertVersion("second");

    // Lose a staged directory just before installation: the transcript has
    // already been replaced when the second rename fails, so both originals
    // must be restored rather than leaving a mixed export.
    await assert.rejects(
      writeStagedExport(filePath, true, async (staged) => {
        await fs.writeFile(staged.filePath, "replacement that must roll back");
        await fs.rm(staged.attachmentsPath!, { recursive: true });
      }),
      { code: "ENOENT" },
    );
    await assertVersion("second");

    await writeStagedExport(filePath, false, async (staged) => {
      assert.equal(staged.attachmentsPath, undefined);
      await fs.writeFile(staged.filePath, JSON.stringify({ version: "transcript only" }));
    });
    assert.equal(await fs.readFile(path.join(attachmentsPath, attachmentName), "utf8"), "second");
    assert.equal(
      (await fs.readdir(directory)).some((name) => name.startsWith(".mimessage-export-")),
      false,
    );
    console.log(
      "Conversation export fixture passed: merged identities, repeated export, retained files, safe symlinks, failure preservation, rollback",
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
};

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
