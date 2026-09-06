import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import electron from "electron";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mimessage-renderer-fixture-"));
const baseline = process.argv.includes("--baseline");

try {
  await build({
    stdin: {
      contents: `
import "./src/styles/globals.css";
import "./src/styles/messages.css";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SendMessageBox } from "./src/components/chat/SendMessageBox";
import { getExternalHttpUrl } from "./src/components/message/AttachmentView";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { ChatEntry } from "./src/components/chat-list/ChatEntry";
import { ChatList } from "./src/components/chat-list/ChatList";
import { useInitialize } from "./src/hooks/dataHooks";
import { MessageBubble } from "./src/components/message/MessageBubble";
import { useMimessage } from "./src/context";
import { getTranscriptItemKey } from "./src/utils/message-pagination";

const check = (condition, message) => { if (!condition) throw new Error(message); };
const rowsRead = new Set();
const messagesRead = new Set();
const chats = Array.from({ length: 20 }, (_, index) => ({
  chat_id: index + 1, chat_guid: "chat-" + index, handles: [],
  get name() { rowsRead.add(index + 1); return "Conversation " + (index + 1); },
  sameParticipantChatIds: index === 1 ? [2, 200] : [],
  latest_message_date: null, latest_message_is_from_me: 1,
  text: "A recent message"
}));
const messages = Array.from({ length: 20 }, (_, index) => ({
  message_id: index + 1, guid: "message-" + index,
  date: (index + 1) * 1000000000, date_obj: new Date(1700000000000 + index * 1000),
  item_type: 0, is_from_me: 1, service: "iMessage", attachment_id: null,
  is_delivered: 1, filename: null, mime_type: null,
  get text() { messagesRead.add(index + 1); return "Message " + (index + 1); }
}));
const handleMap = {};
let updateParent;
let updateShowTimes;
let updateLastBoundary;
const Rows = () => {
  // Home and the pinned-conversation strip also observe the selected chat.
  useMimessage(state => state.chatId);
  const [, setVersion] = React.useState(0);
  const [showTimes, setShowTimes] = React.useState(false);
  const [atNewest, setAtNewest] = React.useState(true);
  updateParent = () => setVersion(value => value + 1);
  updateShowTimes = setShowTimes;
  updateLastBoundary = setAtNewest;
  return <div style={{ display: "flex", height: "100vh" }}>
    <nav style={{ width: 320, flexShrink: 0, overflow: "auto" }}>{chats.map(chat => <ChatEntry key={chat.chat_id} chat={chat} />)}</nav>
    <main style={{ flex: 1, overflow: "auto", padding: 20 }}>{messages.map((message, index) => <MessageBubble
      key={message.message_id} message={message} handleMap={handleMap}
      previousMessage={messages[index - 1] || null} showAvatar={false}
      showTimes={showTimes} isLastInGroup={index === messages.length - 1}
      isLastInTranscript={atNewest && index === messages.length - 1}
    />)}</main>
  </div>;
};
const root = createRoot(document.getElementById("root"));
const flush = async action => {
  rowsRead.clear(); messagesRead.clear();
  flushSync(action);
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return { chatRows: rowsRead.size, messageRows: messagesRead.size };
};
window.fixtureResult = (async () => {
  const counts = {};
  useMimessage.setState({ chatId: 1 });
  await flush(() => root.render(<Rows />));
  check(document.querySelectorAll("nav .conversation-row").length === 20, "all fixture chats mount");
  check(document.querySelectorAll("main .message-row").length === 20, "all fixture messages mount");
  counts.selection = await flush(() => useMimessage.getState().setChatId(2));
  check(document.querySelector("nav [aria-current=page] .conversation-name")?.textContent === "Conversation 2", "selection updates");
  counts.aliasSelection = await flush(() => useMimessage.getState().setChatId(200));
  check(document.querySelector("nav [aria-current=page] .conversation-name")?.textContent === "Conversation 2", "merged conversation remains selected");
  counts.parentUpdate = await flush(updateParent);
  counts.boundaryUpdate = await flush(() => updateLastBoundary(false));
  check(!document.querySelector(".message-delivery-status"), "older pages must not show Delivered");
  await flush(() => updateLastBoundary(true));
  check(document.querySelector(".message-delivery-status")?.textContent === "Delivered", "newest message receipt returns");
  await flush(() => updateShowTimes(true));
  check(document.querySelectorAll(".message-inline-time").length === 20, "timestamps update every message");
  await flush(() => useMimessage.getState().setFilter("Message"));
  check(document.querySelectorAll("main mark").length === 20, "store updates still highlight memoized messages");
  await flush(() => document.querySelector("main .message-row").click());
  check(useMimessage.getState().messageIdToBringToFocus === 1 && useMimessage.getState().filter === null, "search-result click still opens its message");
  await flush(() => { chats[0] = { ...chats[0], name: "Renamed contact" }; updateParent(); });
  check(document.querySelector("nav .conversation-name")?.textContent === "Renamed contact", "changed chat props refresh the row");
  const previousUrlParser = value => {
    if (!value) return null;
    try {
      const url = new URL(value.trim());
      return url.protocol === "http:" || url.protocol === "https:" ? url : null;
    } catch { return null; }
  };
  for (const value of [null, "", "ordinary message", "https://example.com/a", " HTTP://example.com ", "http:example.com", "ht" + String.fromCharCode(10) + "tps://example.com", "h" + String.fromCharCode(9) + "ttps://example.com", String.fromCharCode(1) + "https://example.com", "https://", "file:///tmp/a", "javascript:alert(1)"]) {
    check(getExternalHttpUrl(value)?.href === previousUrlParser(value)?.href, "URL behavior remains consistent: " + value);
  }
  const measureUrlParsing = parse => {
    const start = performance.now();
    for (let index = 0; index < 10000; index++) parse("A normal message about tomorrow's plans " + index);
    return Math.round((performance.now() - start) * 100) / 100;
  };
  counts.plainTextUrlParsingMs = { before: measureUrlParsing(previousUrlParser), after: measureUrlParsing(getExternalHttpUrl) };

  const ipcCalls = [];
  globalThis.ipcRenderer.invoke = async (name) => {
    ipcCalls.push(name);
    if (name === "getChatList") return [
      { ...chats[0], handles: [{ ROWID: 1, handle_id: 1, id: "person@example.com" }] },
      { ...chats[1], handles: [{ ROWID: 2, handle_id: 2, id: "first@example.com" }, { ROWID: 3, handle_id: 3, id: "second@example.com" }] }
    ];
    if (name === "contacts") return [];
    if (name === "getMessagesPage") return { messages, hasOlder: false, hasNewer: false, oldestPredecessor: null, newestSuccessor: null };
    throw new Error("Unexpected fixture IPC: " + name);
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  await flush(() => {
    useMimessage.setState({ chatId: 1, openAiKey: null });
    root.render(<QueryClientProvider client={queryClient}><SendMessageBox /></QueryClientProvider>);
  });
  for (let index = 0; index < 5; index++) await flush(() => {});
  counts.disabledComposerPageRequests = ipcCalls.filter(name => name === "getMessagesPage").length;
  check(document.querySelector(".composer-key-setup"), "key setup remains available without loading AI history");
  if (!${baseline}) check(counts.disabledComposerPageRequests === 0, "disabled AI must not request message history");
  await flush(() => useMimessage.setState({ chatId: 2, openAiKey: "synthetic-fixture-key" }));
  for (let index = 0; index < 5; index++) await flush(() => {});
  counts.groupComposerPageRequests = ipcCalls.filter(name => name === "getMessagesPage").length;
  if (!${baseline}) check(counts.groupComposerPageRequests === 0, "group AI composer must not request history");
  check(document.querySelector("textarea")?.disabled, "group composer remains disabled");
  await flush(() => useMimessage.setState({ chatId: 1 }));
  for (let index = 0; index < 5; index++) await flush(() => {});
  check(ipcCalls.filter(name => name === "getMessagesPage").length > 0, "enabling AI loads context");
  check(document.querySelector("textarea")?.disabled === false, "enabled AI composer becomes usable");
  const submitPrompt = async content => {
    const input = document.querySelector("textarea");
    await flush(() => {
      input.value = content;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    check(typeof globalThis.fixtureAiResolve === "function", "synthetic completion is waiting");
  };
  await submitPrompt("Keep this user prompt");
  const pendingConversation = useMimessage.getState().extendedConversations[1];
  check(pendingConversation.length === 2 && pendingConversation[1].pending, "submission appends one prompt and one pending response");
  await flush(() => globalThis.fixtureAiResolve({ role: "assistant", content: "A synthetic response" }));
  const completedConversation = useMimessage.getState().extendedConversations[1];
  check(completedConversation.length === 2 && completedConversation[0].role === "user" && completedConversation[0].content === "Keep this user prompt", "successful completion preserves user prompt");
  check(completedConversation[1].role === "assistant" && completedConversation[1].content === "A synthetic response" && !completedConversation[1].pending, "successful completion replaces the assistant placeholder");
  check(new Set(completedConversation.map(getTranscriptItemKey.bind(null, 0))).size === 2, "completed transcript keys remain distinct");
  await submitPrompt("Keep the error prompt too");
  await flush(() => globalThis.fixtureAiReject(new Error("Synthetic completion failure")));
  const erroredConversation = useMimessage.getState().extendedConversations[1];
  check(erroredConversation.length === 4 && erroredConversation[2].role === "user" && erroredConversation[2].content === "Keep the error prompt too", "failed completion preserves its user prompt");
  check(erroredConversation[3].role === "assistant" && erroredConversation[3].errored && !erroredConversation[3].pending, "failed completion replaces only its assistant placeholder");
  counts.aiCompletionPromptsPreserved = 2;
  await flush(() => root.render(null));
  queryClient.clear();

  const compositionChats = [1, 2].map(id => ({
    chat_id: id, chat_guid: "composition-chat-" + id, chat_identifier: "person-" + id,
    display_name: "Composition " + id, handles: [{ ROWID: id, handle_id: id, id: "person-" + id }],
    latest_message_date: 1000000000000, latest_message_is_from_me: 0,
    latest_message_is_read: 0, text: "Unread message",
  }));
  const searchResults = Array.from({ length: 205 }, (_, index) => ({
    ...messages[0],
    message_id: index + 1, guid: "search-" + index, chat_id: 1,
    text: "needle " + (index + 1) + " https://example.com/" + index + " https://maps.google.com/" + index,
    attachmentMessages: [
      { attachment_id: index * 2 + 1, filename: null, transfer_name: "needle-photo-" + index + ".png", mime_type: "image/png" },
      { attachment_id: index * 2 + 2, filename: null, transfer_name: "needle-document-" + index + ".pdf", mime_type: "application/pdf" },
    ],
  }));
  globalThis.ipcRenderer.invoke = async name => {
    ipcCalls.push(name);
    if (name === "getChatList") return compositionChats;
    if (name === "contacts") return [];
    if (name === "getPinnedConversationIdentifiers") return ["person-1"];
    if (name === "showConversationFilterMenu") return "unread";
    if (name === "getEarliestMessageDate") return new Date(2020, 0, 1);
    if (name === "getHomeDir") return "/synthetic-home";
    if (name === "globalSearch") return searchResults;
    if (name === "initialize") return true;
    throw new Error("Unexpected composition fixture IPC: " + name);
  };
  const settle = async () => { for (let index = 0; index < 8; index++) await flush(() => {}); };
  const compositionClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  await flush(() => {
    useMimessage.setState({ chatId: null, filter: null, search: null, globalSearch: null, isInWrapped: false, isComposingNewMessage: false });
    root.render(<QueryClientProvider client={compositionClient}><div style={{ height: "100vh", display: "flex" }}><ChatList /></div></QueryClientProvider>);
  });
  await settle();
  check(document.querySelector(".pinned-conversation-name")?.textContent === "Composition 1", "the first unread conversation is pinned");
  check(document.querySelectorAll(".conversation-row").length === 1, "All conversations does not duplicate the pinned conversation");
  await flush(() => document.querySelector('[aria-label="Filter conversations"]').click());
  await settle();
  check(!document.querySelector(".pinned-conversation"), "Unread hides the pinned strip");
  check(document.querySelectorAll(".conversation-row").length === 2, "Unread includes pinned and unpinned unread conversations");
  await flush(() => useMimessage.getState().setIsInWrapped(true));
  await settle();
  check(!document.querySelector(".pinned-conversation"), "Wrapped hides the pinned strip");
  check(document.querySelectorAll(".conversation-row").length === 2, "Wrapped includes pinned conversations");
  counts.pinnedConversationsRemainAvailable = true;

  await flush(() => useMimessage.setState({ isInWrapped: false, search: "needle", globalSearch: "needle" }));
  await settle();
  const sections = [
    ["messages", 3], ["photos", 9], ["links", 6], ["locations", 6], ["documents", 3],
  ];
  const sectionElement = section => document.querySelector(".sidebar-search-" + section);
  const sectionCount = section => sectionElement(section).querySelectorAll("[data-search-result]").length;
  const clickPageButton = (section, label) => flush(() => {
    const button = [...sectionElement(section).querySelectorAll("button")].find(candidate => candidate.textContent.trim() === label);
    check(button && !button.disabled, "the " + label + " page is available for " + section);
    button.click();
  });
  for (const [section, collapsedCount] of sections) {
    check(sectionCount(section) === collapsedCount, section + " starts with a compact preview");
    await clickPageButton(section, "Show More");
    check(sectionCount(section) === 100, section + " expands to a bounded first page");
    await clickPageButton(section, "Next");
    check(sectionCount(section) === 100, section + " has a bounded second page");
    await clickPageButton(section, "Next");
    check(sectionCount(section) === 5, section + " exposes results beyond 200");
    await flush(() => [...sectionElement(section).querySelectorAll("[data-search-result]")].at(-1).click());
    check(useMimessage.getState().messageIdToBringToFocus === 205, section + " final result opens its underlying message");
    check([...sectionElement(section).querySelectorAll("button")].find(button => button.textContent.trim() === "Next").disabled, section + " disables Next at the end");
    await clickPageButton(section, "Previous");
    check(sectionCount(section) === 100, section + " can return to the previous page");
  }
  counts.searchSectionsReachAll205Results = sections.length;
  await flush(() => useMimessage.setState({ search: "needle 1", globalSearch: "needle 1" }));
  await settle();
  check(sectionCount("messages") === 3, "a changed query resets to the compact preview");
  await flush(() => useMimessage.setState({ search: "needle", globalSearch: "needle" }));
  await settle();
  for (const [section, collapsedCount] of sections) {
    check(sectionCount(section) === collapsedCount, "returning to a prior query resets " + section + " pagination");
  }
  await flush(() => root.render(null));
  compositionClient.clear();

  const InitializeFixture = () => {
    const { mutate } = useInitialize();
    React.useEffect(() => { mutate(); }, [mutate]);
    return null;
  };
  const beforeStartup = ipcCalls.length;
  for (let restart = 0; restart < 2; restart++) {
    const startupClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await flush(() => root.render(<QueryClientProvider client={startupClient}><InitializeFixture /></QueryClientProvider>));
    await settle();
    await flush(() => root.render(null));
    startupClient.clear();
  }
  const startupCalls = ipcCalls.slice(beforeStartup);
  check(startupCalls.filter(name => name === "initialize").length === 2, "each simulated restart initializes the existing snapshot");
  check(!startupCalls.includes("copyLocalDb"), "startup never replaces an existing imported snapshot");
  counts.startupPreservesExistingSnapshot = true;
  await flush(() => root.render(<Rows />));
  window.fixtureCleanup = () => root.unmount();
  return counts;
})();
`,
      resolveDir: projectRoot,
      sourcefile: "renderer-fixture.tsx",
      loader: "tsx",
    },
    bundle: true,
    jsx: "automatic",
    platform: "browser",
    loader: { ".ttf": "file", ".png": "file" },
    plugins: [
      {
        name: "fixture-assets-and-ai",
        setup(builder) {
          builder.onLoad({ filter: /src\/utils\/openai\.ts$/ }, () => ({
            contents: `export default {
              generatePrompts: () => [],
              runCompletion: () => new Promise((resolve, reject) => {
                globalThis.fixtureAiResolve = resolve;
                globalThis.fixtureAiReject = reject;
              }),
            };`,
            loader: "js",
          }));
          builder.onResolve({ filter: /^\/sf-symbols\// }, ({ path: asset }) => ({
            path: path.join(projectRoot, "src/public", asset),
          }));
        },
      },
    ],
    outfile: path.join(directory, "fixture.js"),
    define: { global: "globalThis", "process.env.NODE_ENV": '"development"' },
    banner: { js: "globalThis.ipcRenderer = { invoke: async () => null };" },
    logLevel: "silent",
  });
  await fs.writeFile(
    path.join(directory, "index.html"),
    '<!doctype html><link rel="stylesheet" href="fixture.css"><div id="root"></div><script src="fixture.js"></script>',
  );
  await fs.writeFile(
    path.join(directory, "main.cjs"),
    `
const { app, BrowserWindow } = require("electron");
app.setPath("userData", ${JSON.stringify(path.join(directory, "user-data"))});
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 1000, height: 800, webPreferences: { backgroundThrottling: false, nodeIntegration: true, contextIsolation: false } });
  try {
    await window.loadFile(${JSON.stringify(path.join(directory, "index.html"))});
    const result = await window.webContents.executeJavaScript("window.fixtureResult");
    if (process.env.MIMESSAGE_RENDERER_SCREENSHOT) {
      const screenshot = await window.webContents.capturePage();
      await require("node:fs/promises").writeFile(process.env.MIMESSAGE_RENDERER_SCREENSHOT, screenshot.toPNG());
    }
    await window.webContents.executeJavaScript("window.fixtureCleanup()");
    console.log("RENDERER_RESULT " + JSON.stringify(result));
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
`,
  );
  const { exitCode, output } = await new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(electron, [path.join(directory, "main.cjs")], { cwd: projectRoot, env });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.once("error", reject);
    const timeout = setTimeout(() => child.kill(), 30_000);
    child.once("exit", (exitCode) => {
      clearTimeout(timeout);
      resolve({ exitCode, output });
    });
  });
  assert.equal(exitCode, 0, output);
  const resultLine = output.split("\n").find((line) => line.startsWith("RENDERER_RESULT "));
  assert.ok(resultLine, output);
  const result = JSON.parse(resultLine.slice("RENDERER_RESULT ".length));
  if (!baseline) {
    assert.deepEqual(result.selection, { chatRows: 2, messageRows: 0 });
    assert.deepEqual(result.aliasSelection, { chatRows: 0, messageRows: 0 });
    assert.deepEqual(result.parentUpdate, { chatRows: 0, messageRows: 0 });
    assert.deepEqual(result.boundaryUpdate, { chatRows: 0, messageRows: 1 });
  }
  console.log(JSON.stringify({ baseline, rowsMounted: 20, ...result }, null, 2));
} finally {
  await fs.rm(directory, { recursive: true, force: true });
}
