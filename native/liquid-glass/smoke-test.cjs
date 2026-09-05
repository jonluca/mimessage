const assert = require("node:assert/strict");
const path = require("node:path");
const { app, BrowserWindow } = require("electron");

const addon = require(path.join(__dirname, "prebuilds", `darwin-${process.arch}`, "mimessage_liquid_glass.node"));

app
  .whenReady()
  .then(() => {
    const support = addon.support();
    assert.equal(support.supported, true, support.reason);

    const window = new BrowserWindow({
      show: false,
      transparent: true,
      backgroundColor: "#00000000",
    });
    const handle = window.getNativeWindowHandle();

    const added = addon.add(handle, { style: "regular", frame: { width: 320 } });
    assert.deepEqual(added, { supported: true, applied: true, attached: true });

    const duplicate = addon.add(handle);
    assert.equal(duplicate.reason, "already-attached");

    const updated = addon.update(handle, {
      style: "clear",
      tintColor: { red: 0.5, green: 0.55, blue: 0.65, alpha: 0.1 },
      cornerRadius: 18,
      spacing: 8,
      frame: { x: 12, y: 12, width: 296 },
    });
    assert.deepEqual(updated, { supported: true, applied: true, attached: true });

    const removed = addon.remove(handle);
    assert.deepEqual(removed, { supported: true, applied: true, attached: false });
    assert.equal(addon.remove(handle).reason, "not-attached");

    window.destroy();
    console.log(JSON.stringify({ support, added, updated, removed }));
    app.quit();
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
