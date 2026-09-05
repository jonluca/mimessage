import { queryClient } from "../pages/_app";
import { useMimessage } from "../context";

interface PreferencePatch {
  aiPersonaInstructions?: string;
  openAiKey?: string | null;
  relation?: string;
  useSemanticSearch?: boolean;
}

export const register = () => {
  global.ipcRenderer.on("composeNewMessage", () => {
    const state = useMimessage.getState();
    state.setSearch(null);
    state.setGlobalSearch(null);
    state.setSelectedSearchMessageId(null);
    state.setIsInWrapped(false);
    state.setChatId(null);
    state.setIsComposingNewMessage(true);
  });
  global.ipcRenderer.on("refreshChats", async () => {
    await queryClient.invalidateQueries();
    await queryClient.refetchQueries();
  });
  global.ipcRenderer.on("preferencesChanged", (patch: unknown) => {
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      return;
    }
    const preferences = patch as PreferencePatch;
    const state = useMimessage.getState();
    if (preferences.openAiKey === null || typeof preferences.openAiKey === "string") {
      state.setOpenAiKey(preferences.openAiKey);
    }
    if (typeof preferences.relation === "string") {
      state.setRelation(preferences.relation);
    }
    if (typeof preferences.aiPersonaInstructions === "string") {
      state.setAiPersonaInstructions(preferences.aiPersonaInstructions);
    }
    if (typeof preferences.useSemanticSearch === "boolean") {
      const effectiveKey = "openAiKey" in preferences ? preferences.openAiKey : state.openAiKey;
      state.setUseSemanticSearch(Boolean(effectiveKey) && preferences.useSemanticSearch);
    }
  });
  global.ipcRenderer.on("openWrapped", () => {
    const state = useMimessage.getState();
    state.setSearch(null);
    state.setGlobalSearch(null);
    state.setSelectedSearchMessageId(null);
    state.setIsComposingNewMessage(false);
    state.setChatId(null);
    state.setIsInWrapped(true);
  });
};
