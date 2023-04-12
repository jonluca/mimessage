import type { ColumnType } from "kysely";

export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>
  ? ColumnType<S, I | undefined, U>
  : ColumnType<T, T | undefined, T>;

export interface _SqliteDatabaseProperties {
  key: string | null;
  value: string | null;
}

export interface Attachment {
  ROWID: Generated<number | null>;
  guid: string;
  created_date: Generated<number | null>;
  start_date: Generated<number | null>;
  filename: string | null;
  uti: string | null;
  mime_type: string | null;
  transfer_state: Generated<number | null>;
  is_outgoing: Generated<number | null>;
  user_info: Buffer | null;
  transfer_name: string | null;
  total_bytes: Generated<number | null>;
  is_sticker: Generated<number | null>;
  sticker_user_info: Buffer | null;
  attribution_info: Buffer | null;
  hide_attachment: Generated<number | null>;
  ck_sync_state: Generated<number | null>;
  ck_server_change_token_blob: Buffer | null;
  ck_record_id: string | null;
  original_guid: string;
  is_commsafety_sensitive: Generated<number | null>;
}

export interface Chat {
  ROWID: Generated<number | null>;
  guid: string;
  style: number | null;
  state: number | null;
  account_id: string | null;
  properties: Buffer | null;
  chat_identifier: string | null;
  service_name: string | null;
  room_name: string | null;
  account_login: string | null;
  is_archived: Generated<number | null>;
  last_addressed_handle: string | null;
  display_name: string | null;
  group_id: string | null;
  is_filtered: Generated<number | null>;
  successful_query: number | null;
  engram_id: string | null;
  server_change_token: string | null;
  ck_sync_state: Generated<number | null>;
  original_group_id: string | null;
  last_read_message_timestamp: Generated<number | null>;
  cloudkit_record_id: string | null;
  last_addressed_sim_id: string | null;
  is_blackholed: Generated<number | null>;
  syndication_date: Generated<number | null>;
  syndication_type: Generated<number | null>;
  is_recovered: Generated<number | null>;
}

export interface ChatHandleJoin {
  chat_id: number | null;
  handle_id: number | null;
}

export interface ChatMessageJoin {
  chat_id: number | null;
  message_id: number | null;
  message_date: Generated<number | null>;
}

export interface ChatRecoverableMessageJoin {
  chat_id: number | null;
  message_id: number | null;
  delete_date: number | null;
  ck_sync_state: Generated<number | null>;
}

export interface DeletedMessages {
  ROWID: Generated<number | null>;
  guid: string;
}

export interface Handle {
  ROWID: Generated<number | null>;
  id: string;
  country: string | null;
  service: string;
  uncanonicalized_id: string | null;
  person_centric_id: string | null;
}

export interface Kvtable {
  ROWID: Generated<number | null>;
  key: string;
  value: Buffer;
}

export interface Message {
  ROWID: Generated<number | null>;
  guid: string;
  text: string | null;
  replace: Generated<number | null>;
  service_center: string | null;
  handle_id: Generated<number | null>;
  subject: string | null;
  country: string | null;
  attributedBody: Buffer | null;
  version: Generated<number | null>;
  type: Generated<number | null>;
  service: string | null;
  account: string | null;
  account_guid: string | null;
  error: Generated<number | null>;
  date: number | null;
  date_read: number | null;
  date_delivered: number | null;
  is_delivered: Generated<number | null>;
  is_finished: Generated<number | null>;
  is_emote: Generated<number | null>;
  is_from_me: Generated<number | null>;
  is_empty: Generated<number | null>;
  is_delayed: Generated<number | null>;
  is_auto_reply: Generated<number | null>;
  is_prepared: Generated<number | null>;
  is_read: Generated<number | null>;
  is_system_message: Generated<number | null>;
  is_sent: Generated<number | null>;
  has_dd_results: Generated<number | null>;
  is_service_message: Generated<number | null>;
  is_forward: Generated<number | null>;
  was_downgraded: Generated<number | null>;
  is_archive: Generated<number | null>;
  cache_has_attachments: Generated<number | null>;
  cache_roomnames: string | null;
  was_data_detected: Generated<number | null>;
  was_deduplicated: Generated<number | null>;
  is_audio_message: Generated<number | null>;
  is_played: Generated<number | null>;
  date_played: number | null;
  item_type: Generated<number | null>;
  other_handle: Generated<number | null>;
  group_title: string | null;
  group_action_type: Generated<number | null>;
  share_status: Generated<number | null>;
  share_direction: Generated<number | null>;
  is_expirable: Generated<number | null>;
  expire_state: Generated<number | null>;
  message_action_type: Generated<number | null>;
  message_source: Generated<number | null>;
  associated_message_guid: string | null;
  associated_message_type: Generated<number | null>;
  balloon_bundle_id: string | null;
  payload_data: Buffer | null;
  expressive_send_style_id: string | null;
  associated_message_range_location: Generated<number | null>;
  associated_message_range_length: Generated<number | null>;
  time_expressive_send_played: number | null;
  message_summary_info: Buffer | null;
  ck_sync_state: Generated<number | null>;
  ck_record_id: string | null;
  ck_record_change_tag: string | null;
  destination_caller_id: string | null;
  is_corrupt: Generated<number | null>;
  reply_to_guid: string | null;
  sort_id: number | null;
  is_spam: Generated<number | null>;
  has_unseen_mention: Generated<number | null>;
  thread_originator_guid: string | null;
  thread_originator_part: string | null;
  syndication_ranges: string | null;
  synced_syndication_ranges: string | null;
  was_delivered_quietly: Generated<number | null>;
  did_notify_recipient: Generated<number | null>;
  date_retracted: number | null;
  date_edited: number | null;
  was_detonated: Generated<number | null>;
  part_count: number | null;
  is_stewie: Generated<number | null>;
  is_kt_verified: Generated<number | null>;
}

export interface MessageAttachmentJoin {
  message_id: number | null;
  attachment_id: number | null;
}

export interface MessageFts {
  text: string;
  message_id: string;
}

export interface MessageFtsConfig {
  k: string;
  v: string | null;
}

export interface MessageFtsContent {
  id: number | null;
  c0: string | null;
  c1: string | null;
}

export interface MessageFtsData {
  id: number | null;
  block: Buffer | null;
}

export interface MessageFtsDocsize {
  id: number | null;
  sz: Buffer | null;
}

export interface MessageFtsIdx {
  segid: string;
  term: string;
  pgno: string | null;
}

export interface MessageProcessingTask {
  ROWID: Generated<number | null>;
  guid: string;
  task_flags: number;
}

export interface RecoverableMessagePart {
  chat_id: number | null;
  message_id: number | null;
  part_index: number | null;
  delete_date: number | null;
  part_text: Buffer;
  ck_sync_state: Generated<number | null>;
}

export interface SyncDeletedAttachments {
  ROWID: Generated<number | null>;
  guid: string;
  recordID: string | null;
}

export interface SyncDeletedChats {
  ROWID: Generated<number | null>;
  guid: string;
  recordID: string | null;
  timestamp: number | null;
}

export interface SyncDeletedMessages {
  ROWID: Generated<number | null>;
  guid: string;
  recordID: string | null;
}

export interface UnsyncedRemovedRecoverableMessages {
  ROWID: Generated<number | null>;
  chat_guid: string;
  message_guid: string;
  part_index: number | null;
}

export interface DB {
  _SqliteDatabaseProperties: _SqliteDatabaseProperties;
  attachment: Attachment;
  chat: Chat;
  chat_handle_join: ChatHandleJoin;
  chat_message_join: ChatMessageJoin;
  chat_recoverable_message_join: ChatRecoverableMessageJoin;
  deleted_messages: DeletedMessages;
  handle: Handle;
  kvtable: Kvtable;
  message: Message;
  message_attachment_join: MessageAttachmentJoin;
  message_fts: MessageFts;
  message_fts_config: MessageFtsConfig;
  message_fts_content: MessageFtsContent;
  message_fts_data: MessageFtsData;
  message_fts_docsize: MessageFtsDocsize;
  message_fts_idx: MessageFtsIdx;
  message_processing_task: MessageProcessingTask;
  recoverable_message_part: RecoverableMessagePart;
  sync_deleted_attachments: SyncDeletedAttachments;
  sync_deleted_chats: SyncDeletedChats;
  sync_deleted_messages: SyncDeletedMessages;
  unsynced_removed_recoverable_messages: UnsyncedRemovedRecoverableMessages;
}
