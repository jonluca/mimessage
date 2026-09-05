export interface PreferencePatch {
  aiPersonaInstructions?: string;
  openAiKey?: string | null;
  relation?: string;
  useSemanticSearch?: boolean;
}

export const broadcastPreferences = (patch: PreferencePatch) => {
  void global.ipcRenderer.invoke("broadcastPreferences", patch);
};
