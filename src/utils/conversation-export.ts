interface ConversationIds {
  chat_id: number | null;
  sameParticipantChatIds?: number[];
}

export const getConversationExportIds = (chat: ConversationIds) => {
  const ids = [chat.chat_id, ...(chat.sameParticipantChatIds || [])];
  if (ids.some((id) => !Number.isSafeInteger(id) || (id as number) <= 0)) {
    throw new Error("Invalid conversation export IDs");
  }
  return [...new Set(ids as number[])];
};

export const getConversationForExport = <T extends ConversationIds & { handles: Array<{ ROWID: number | null }> }>(
  chat: T,
  chats: ReadonlyMap<number, T>,
): T => {
  const ids = getConversationExportIds(chat);
  const handles = new Map<number | null, T["handles"][number]>();
  for (const id of ids) {
    const participantChat = id === chat.chat_id ? chat : chats.get(id);
    for (const handle of participantChat?.handles || []) {
      handles.set(handle.ROWID, handle);
    }
  }
  return { ...chat, sameParticipantChatIds: ids, handles: [...handles.values()] };
};
