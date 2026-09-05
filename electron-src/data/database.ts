import type { SelectQueryBuilder } from "kysely";
import { sql } from "kysely";
import type { Database } from "better-sqlite3";
import type { DB as MesssagesDatabase } from "../../_generated/types";
import { countBy, groupBy, uniq } from "lodash-es";
import type { Contact } from "electron-mac-contacts";
import { getTextFromBuffer, parseRichLinkMetadata } from "../utils/buffer";
import { appMessagesDbCopy } from "../utils/constants";
import { getStatsForText } from "../semantic-search/semantic-search-stats";
import { removeStopWords } from "../utils/text";
import BaseDatabase from "./base-database";
import MessageTextIndex from "./text-index";
import type { FilteredMessageTextScope, MessageTextRecord, TextSearchFilters } from "./text-index";

type ExtractO<T> = T extends SelectQueryBuilder<any, any, infer O> ? O : never;
type JoinedMessageType = ExtractO<ReturnType<SQLDatabase["getJoinedMessageQuery"]>>;
export type MessagePageBoundaryContext = Pick<
  JoinedMessageType,
  "date" | "handle_id" | "is_from_me" | "item_type" | "message_id" | "service"
>;
export interface MessagePageCursor {
  /** Exact Messages timestamp encoded as a decimal string to preserve its 64-bit value over IPC. */
  date: string;
  messageId: number;
}

export interface MessagePageOptions {
  anchorMessageId?: number;
  cursor?: MessagePageCursor | null;
  direction?: "newer" | "older";
  limit?: number;
  position?: "latest" | "oldest";
}

interface MessagePageKey {
  cursor_date: string;
  message_id: number;
}

const DEFAULT_MESSAGE_PAGE_SIZE = 100;
export const MAX_MESSAGE_PAGE_SIZE = 200;
const DEFAULT_THREAD_SEARCH_RESULT_LIMIT = 200;
export const MAX_THREAD_SEARCH_RESULT_LIMIT = 1_000;
const MAX_THREAD_SEARCH_QUERY_LENGTH = 1_000;
const MIN_SQLITE_INTEGER = -9_223_372_036_854_775_808n;
const MAX_SQLITE_INTEGER = 9_223_372_036_854_775_807n;
const NULL_MESSAGE_DATE_SQL = "-9223372036854775808";
const MESSAGE_GUID_QUERY_PAGE_SIZE = 1_000;
const TAPBACK_GUID_QUERY_PAGE_SIZE = 400;
const TAPBACK_ADD_TYPE_MIN = 2_000;
const TAPBACK_ADD_TYPE_MAX = 2_005;
const TAPBACK_REMOVE_TYPE_MIN = 3_000;
const TAPBACK_REMOVE_TYPE_MAX = 3_005;
const MAX_SEARCH_RESULT_ROWS = 10_000;
const WRAPPED_MONTH_INDEX: Readonly<Record<string, number>> = {
  January: 0,
  February: 1,
  March: 2,
  April: 3,
  May: 4,
  June: 5,
  July: 6,
  August: 7,
  September: 8,
  October: 9,
  November: 10,
  December: 11,
};
const WRAPPED_MONTH_NAMES = Object.keys(WRAPPED_MONTH_INDEX);
const WRAPPED_WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const escapeLikePattern = (value: string) => value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");

export interface MessageTapback {
  handle_id: number | null;
  is_from_me: boolean;
  reaction_guid: string;
  type: number;
}

export interface MessageReplyOrigin {
  attachmentLabel: string | null;
  guid: string;
  handle_id: number | null;
  is_from_me: boolean;
  message_id: number | null;
  text: string | null;
}

const isTapbackMessageType = (value: number | null | undefined): value is number =>
  value !== null &&
  value !== undefined &&
  ((value >= TAPBACK_ADD_TYPE_MIN && value <= TAPBACK_ADD_TYPE_MAX) ||
    (value >= TAPBACK_REMOVE_TYPE_MIN && value <= TAPBACK_REMOVE_TYPE_MAX));

const normalizeTapbackTargetGuid = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }
  if (value.startsWith("bp:")) {
    return value.slice(3);
  }
  if (value.startsWith("p:")) {
    const separatorIndex = value.indexOf("/");
    if (separatorIndex >= 0) {
      return value.slice(separatorIndex + 1);
    }
  }
  return value;
};

export class SQLDatabase extends BaseDatabase<MesssagesDatabase> {
  private textIndex: MessageTextIndex | undefined;
  private textIndexReadiness: Promise<void> | undefined;
  private supportsTapbackAssociations = false;

  constructor(name: string, path: string) {
    super(name, path, undefined, { fileMustExist: true });
  }

  protected override onInitialized(sqliteDb: Database): void {
    this.supportsTapbackAssociations = (
      sqliteDb.prepare("PRAGMA table_info(message)").all() as Array<{ name: string }>
    ).some((column) => column.name === "associated_message_guid");
    const textIndex = new MessageTextIndex(sqliteDb);
    this.textIndex = textIndex;
    this.trackTextIndexReadiness(textIndex);
  }

  protected override async prepareForTermination(): Promise<void> {
    const textIndex = this.textIndex;
    this.textIndex = undefined;
    this.textIndexReadiness = undefined;
    this.supportsTapbackAssociations = false;
    await textIndex?.stop();
  }

  waitForTextIndex = async (): Promise<void> => {
    await this.getCompleteTextIndex();
  };

  private trackTextIndexReadiness = (textIndex: MessageTextIndex) => {
    const readiness = textIndex.start();
    this.textIndexReadiness = readiness;
    void readiness.catch(() => {
      if (this.textIndex === textIndex && this.textIndexReadiness === readiness) {
        this.textIndexReadiness = undefined;
      }
    });
    return readiness;
  };

  private getCompleteTextIndex = async (): Promise<MessageTextIndex> => {
    if (!this.textIndex) {
      await this.initialize();
    }
    const textIndex = this.textIndex;
    if (!textIndex) {
      throw new Error("Message text index was not started");
    }
    const readiness = this.textIndexReadiness ?? this.trackTextIndexReadiness(textIndex);
    await readiness;
    if (textIndex !== this.textIndex) {
      return this.getCompleteTextIndex();
    }
    return textIndex;
  };

  private getChatsWithMessagesQuery = () => {
    const db = this.db;
    return db
      .selectFrom("chat as c")
      .select([
        "c.ROWID as chat_id",
        "c.guid as chat_guid",
        "c.is_blackholed",
        "c.is_filtered",
        "c.last_read_message_timestamp",
      ])
      .innerJoin("message as m", (join) =>
        join.on((eb) =>
          eb(
            "m.ROWID",
            "=",
            eb
              .selectFrom("chat_message_join as cmj")
              .select("cmj.message_id")
              .whereRef("cmj.chat_id", "=", "c.ROWID")
              .orderBy("cmj.message_date", "desc")
              .orderBy("cmj.message_id", "desc")
              .limit(1),
          ),
        ),
      )
      .select([
        "m.date as latest_message_date",
        "m.is_from_me as latest_message_is_from_me",
        "m.is_read as latest_message_is_read",
        "m.is_spam as latest_message_is_spam",
        "text",
        "attributedBody",
        "chat_identifier",
        "display_name",
      ]);
  };

  getChatList = async () => {
    const db = this.db;
    const query = this.getChatsWithMessagesQuery().orderBy("m.date", "desc");
    const [chats, handles] = await Promise.all([
      query.execute(),
      db
        .selectFrom("handle")
        .leftJoin("chat_handle_join", "handle.ROWID", "chat_handle_join.handle_id")
        .selectAll()
        .execute(),
    ]);
    type Handles = Array<(typeof handles)[number] & { contact?: Contact | null }>;
    type EnhancedChat = (typeof chats)[number] & { handles: Handles; name: string; sameParticipantChatIds: number[] };
    const handlesByChatId = groupBy(handles, "chat_id");
    const enhancedChats = chats as EnhancedChat[];
    await Promise.all(
      enhancedChats.map(async (chat) => {
        chat.handles = handlesByChatId[chat.chat_id as keyof typeof handlesByChatId] || [];
        if (!chat.text && chat.attributedBody) {
          chat.text = await getTextFromBuffer(chat.attributedBody);
        }
      }),
    );
    return enhancedChats;
  };

  getEarliestMessageDate = async () => {
    const db = this.db;
    const query = db.selectFrom("message").select((e) => e.fn.min("date").as("min_date"));
    const result = await query.execute();
    const minDate = result[0]?.min_date;
    if (!minDate) {
      return new Date();
    }
    return new Date(minDate / 1000000 + 978307200000);
  };

  private getJoinedMessageQuery = () => {
    const db = this.db;
    return db
      .selectFrom("message")
      .innerJoin("chat_message_join", "chat_message_join.message_id", "message.ROWID")
      .leftJoin("message_attachment_join", "message_attachment_join.message_id", "message.ROWID")
      .leftJoin("attachment", "message_attachment_join.attachment_id", "attachment.ROWID")
      .select([
        "attachment_id",
        "balloon_bundle_id",
        "message.guid as guid",
        "attributedBody",
        "chat_message_join.chat_id as chat_id",
        "date",
        "date_delivered",
        "date_read",
        "group_action_type",
        "group_title",
        "mime_type",
        "other_handle",
        "message.handle_id as handle_id",
        "is_from_me",
        "is_delivered",
        "is_read",
        "item_type",
        "filename",
        "error",
        "payload_data",
        "share_direction",
        "message.service as service",
        "text",
        "thread_originator_guid",
        "thread_originator_part",
        "transfer_name",
        "type",
      ])
      .select(sql<number>`message.ROWID`.as("message_id"));
  };

  /**
   * Select one chat association before joining attachments. A message can be
   * linked to more than one requested chat, which would otherwise multiply its
   * attachment rows.
   */
  private getJoinedMessageQueryForChatIds = (chatIds: number[]) => {
    return this.getJoinedMessageQuery()
      .where((eb) =>
        eb(
          "chat_message_join.chat_id",
          "=",
          eb
            .selectFrom("chat_message_join as selected_cmj")
            .select((select) => select.fn.min("selected_cmj.chat_id").as("chat_id"))
            .whereRef("selected_cmj.message_id", "=", "message.ROWID")
            .where("selected_cmj.chat_id", "in", chatIds),
        ),
      )
      .where(
        sql<boolean>`COALESCE(message.associated_message_type, 0) NOT BETWEEN ${TAPBACK_ADD_TYPE_MIN} AND ${TAPBACK_REMOVE_TYPE_MAX}`,
      )
      .distinct();
  };

  private getMessagePageKeysQuery = (chatIds: number[]) => {
    return this.db
      .selectFrom("message")
      .innerJoin("chat_message_join as page_cmj", "page_cmj.message_id", "message.ROWID")
      .select([
        sql<number>`message.ROWID`.as("message_id"),
        sql<string>`CAST(COALESCE(message.date, ${sql.raw(NULL_MESSAGE_DATE_SQL)}) AS TEXT)`.as("cursor_date"),
      ])
      .where("page_cmj.chat_id", "in", chatIds)
      .where(
        sql<boolean>`COALESCE(message.associated_message_type, 0) NOT BETWEEN ${TAPBACK_ADD_TYPE_MIN} AND ${TAPBACK_REMOVE_TYPE_MAX}`,
      )
      .distinct();
  };

  private getMessagePageKeys = async (
    chatIds: number[],
    cursor: MessagePageCursor | undefined,
    direction: "newer" | "older",
    limit: number,
  ) => {
    let query = this.getMessagePageKeysQuery(chatIds);
    if (cursor) {
      const comparison = direction === "older" ? "<" : ">";
      query = query.where(
        sql<boolean>`(
          COALESCE(message.date, ${sql.raw(NULL_MESSAGE_DATE_SQL)}) ${sql.raw(comparison)} CAST(${cursor.date} AS INTEGER)
          OR (
            COALESCE(message.date, ${sql.raw(NULL_MESSAGE_DATE_SQL)}) = CAST(${cursor.date} AS INTEGER)
            AND message.ROWID ${sql.raw(comparison)} ${cursor.messageId}
          )
        )`,
      );
    }
    const order = direction === "older" ? "desc" : "asc";
    return query
      .orderBy(sql`COALESCE(message.date, ${sql.raw(NULL_MESSAGE_DATE_SQL)})`, order)
      .orderBy("message.ROWID", order)
      .limit(limit)
      .execute();
  };

  private normalizeChatIds = (chatId: number | number[]) => {
    const chatIds = uniq([chatId].flat());
    if (chatIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
      throw new Error("Invalid chat ID");
    }
    return chatIds;
  };

  private getBoundedLimit = (limit: number | undefined, fallback: number, maximum: number) => {
    if (limit === undefined) {
      return fallback;
    }
    if (!Number.isFinite(limit) || limit <= 0) {
      throw new Error("Invalid result limit");
    }
    return Math.min(Math.floor(limit), maximum);
  };

  private validateMessagePageCursor = (cursor: MessagePageCursor | null | undefined) => {
    if (!cursor) {
      return undefined;
    }
    if (
      typeof cursor !== "object" ||
      typeof cursor.date !== "string" ||
      !/^-?\d{1,20}$/.test(cursor.date) ||
      !Number.isSafeInteger(cursor.messageId) ||
      cursor.messageId <= 0
    ) {
      throw new Error("Invalid message page cursor");
    }
    const date = BigInt(cursor.date);
    if (date < MIN_SQLITE_INTEGER || date > MAX_SQLITE_INTEGER) {
      throw new Error("Invalid message page cursor");
    }
    return cursor;
  };

  private messagePageKeyToCursor = (key: MessagePageKey): MessagePageCursor => ({
    date: key.cursor_date,
    messageId: key.message_id,
  });

  private sortMessagePageKeysChronologically = (keys: MessagePageKey[]) => {
    return keys.toSorted((left, right) => {
      const leftDate = BigInt(left.cursor_date);
      const rightDate = BigInt(right.cursor_date);
      if (leftDate !== rightDate) {
        return leftDate < rightDate ? -1 : 1;
      }
      return left.message_id - right.message_id;
    });
  };

  private getMessagePageBoundaryContext = async (
    chatIds: number[],
    key: MessagePageKey,
    direction: "newer" | "older",
  ): Promise<MessagePageBoundaryContext | null> => {
    const [boundaryKey] = await this.getMessagePageKeys(chatIds, this.messagePageKeyToCursor(key), direction, 1);
    if (!boundaryKey) {
      return null;
    }
    return (
      (await this.db
        .selectFrom("message")
        .select(["date", "handle_id", "is_from_me", "item_type", "service"])
        .select(sql<number>`message.ROWID`.as("message_id"))
        .where("message.ROWID", "=", boundaryKey.message_id)
        .executeTakeFirst()) ?? null
    );
  };

  private orderJoinedMessagesChronologically = <T extends ReturnType<SQLDatabase["getJoinedMessageQueryForChatIds"]>>(
    query: T,
  ) =>
    query
      .orderBy(sql`COALESCE(message.date, ${sql.raw(NULL_MESSAGE_DATE_SQL)})`, "asc")
      .orderBy("message.ROWID", "asc")
      .orderBy("attachment.ROWID", "asc");

  private stripMessageTransportBlobs = <T extends JoinedMessageType>(messages: T[]) => {
    interface TransportMessage {
      attachmentMessages?: TransportMessage[];
      attributedBody?: unknown;
      payload_data?: unknown;
    }
    const strip = (message: TransportMessage) => {
      delete message.attributedBody;
      delete message.payload_data;
      message.attachmentMessages?.forEach(strip);
    };
    messages.forEach((message) => strip(message as unknown as TransportMessage));
    return messages;
  };

  getMessageGuidsFromText = async (texts: string[]) => {
    const textIndex = await this.getCompleteTextIndex();
    return textIndex.getMessageGuidsForTexts(texts);
  };

  globalSearchTextBased = async (
    searchTerm: string,
    chatIds?: number[],
    handleIds?: number[],
    startDate?: Date | null,
    endDate?: Date | null,
  ) => {
    const textIndex = await this.getCompleteTextIndex();
    const filters = this.getTextSearchFilters(chatIds, handleIds, startDate, endDate);
    const cleanedQuery = searchTerm
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
    const ftsQuery = cleanedQuery
      .split(" ")
      .filter(Boolean)
      .map((token) => `"${token}"*`)
      .join(" ");
    const textResultLimit = 1000;
    const ftsMessageGuids = ftsQuery ? await textIndex.searchFts(ftsQuery, filters, textResultLimit) : [];
    const normalizedSearchTerm = searchTerm.trim().replace(/\s+/g, " ");
    const ftsPreservesTheQuery = cleanedQuery.toLocaleLowerCase() === normalizedSearchTerm.toLocaleLowerCase();
    // FTS is the fast path, but token-prefix search cannot represent punctuation
    // or mid-token matches (for example, `C++` or `cat` in `concatenate`). Keep
    // contains-search semantics whenever FTS did not already fill the bounded
    // result set, or when query cleaning changed what the user typed.
    const substringMessageGuids =
      ftsMessageGuids.length < textResultLimit || !ftsPreservesTheQuery
        ? await textIndex.searchSubstring(searchTerm, filters, textResultLimit)
        : [];
    const attachmentPattern = `%${escapeLikePattern(searchTerm)}%`;
    const attachmentQuery = this.getFilteredSearchQuery({ chatIds, handleIds, startDate, endDate })
      .where(sql<boolean>`filename LIKE ${attachmentPattern} ESCAPE ${"\\"}`)
      .limit(1000);
    const attachmentResults = await attachmentQuery.execute();
    const attachmentMessageGuids = attachmentResults.map((message) => message.guid as string);
    const allMessageGuids = uniq([...ftsMessageGuids, ...substringMessageGuids, ...attachmentMessageGuids]);
    return this.fullTextMessageSearchWithGuids(allMessageGuids, searchTerm, chatIds, handleIds, startDate, endDate);
  };

  private getTextSearchFilters = (
    chatIds?: number[],
    handleIds?: number[],
    startDate?: Date | null,
    endDate?: Date | null,
  ): TextSearchFilters => {
    const filters: TextSearchFilters = { chatIds, handleIds };
    if (startDate) {
      filters.startDate = (startDate.getTime() - 978_307_200_000) * 1_000_000;
    }
    if (endDate) {
      const endDateExclusive = new Date(endDate);
      endDateExclusive.setDate(endDateExclusive.getDate() + 1);
      filters.endDate = (endDateExclusive.getTime() - 978_307_200_000) * 1_000_000;
    }
    return filters;
  };
  private getFilteredSearchQuery = ({
    chatIds,
    handleIds,
    startDate,
    endDate,
  }: {
    chatIds?: number[];
    handleIds?: number[];
    startDate?: Date | null;
    endDate?: Date | null;
  }) => {
    let query = this.getJoinedMessageQuery()
      .select("message.guid as guid")
      .where("item_type", "not in", [1, 3, 4, 5, 6])
      .where("associated_message_type", "=", 0);

    if (chatIds?.length) {
      query = query.where("chat_id", "in", chatIds);
    }
    if (handleIds?.length) {
      query = query.where("handle_id", "in", handleIds);
    }

    if (startDate) {
      const offset = (startDate.getTime() - 978307200000) * 1000000;
      query = query.where("date", ">", offset);
    }

    if (endDate) {
      const endDateExclusive = new Date(endDate);
      endDateExclusive.setDate(endDateExclusive.getDate() + 1);
      const offset = (endDateExclusive.getTime() - 978307200000) * 1000000;
      query = query.where("date", "<", offset);
    }

    return query;
  };
  fullTextMessageSearchWithGuids = async (
    messageGuids: string[],
    _searchTerm: string,
    chatIds?: number[],
    handleIds?: number[],
    startDate?: Date | null,
    endDate?: Date | null,
  ) => {
    if (!messageGuids.length) {
      return [];
    }
    const rankedMessageGuids = uniq(messageGuids);
    const messages: JoinedMessageType[] = [];
    for (let offset = 0; offset < rankedMessageGuids.length; offset += MESSAGE_GUID_QUERY_PAGE_SIZE) {
      const remaining = MAX_SEARCH_RESULT_ROWS - messages.length;
      if (remaining <= 0) {
        break;
      }
      const guidPage = rankedMessageGuids.slice(offset, offset + MESSAGE_GUID_QUERY_PAGE_SIZE);
      const page = await this.getFilteredSearchQuery({ chatIds, handleIds, startDate, endDate })
        .where("message.guid", "in", guidPage)
        .limit(remaining)
        .execute();
      messages.push(...page);
    }
    const indexMap = new Map<string, number>();
    for (let i = 0; i < rankedMessageGuids.length; i++) {
      indexMap.set(rankedMessageGuids[i], i);
    }
    messages.sort((a, b) => {
      const aIndex = indexMap.get(a.guid!);
      const bIndex = indexMap.get(b.guid!);
      if (aIndex === undefined || bIndex === undefined) {
        return 0;
      }
      return aIndex - bIndex;
    });
    return this.enhanceMessageResponses<(typeof messages)[number]>(messages);
  };
  private convertDate = (date: number) => {
    return new Date(date / 1000000 + 978307200000);
  };

  private addDateToMessage = (message: {
    date?: number | null;
    date_delivered?: number | null;
    date_read?: number | null;
    date_obj?: Date;
    date_obj_delivered?: Date;
    date_obj_read?: Date;
  }) => {
    if (message.date) {
      message.date_obj = this.convertDate(message.date);
    }
    if (message.date_delivered) {
      message.date_obj_delivered = this.convertDate(message.date_delivered);
    }
    if (message.date_read) {
      message.date_obj_read = this.convertDate(message.date_read);
    }
  };

  private addTapbacksToMessages = async <
    T extends {
      chat_id: number | null;
      guid: string | null;
      tapbacks?: MessageTapback[];
    },
  >(
    messages: T[],
  ) => {
    if (!this.supportsTapbackAssociations || !messages.length) {
      return;
    }

    const messagesByGuid = new Map<string, T[]>();
    const chatIds = new Set<number>();
    for (const message of messages) {
      if (!message.guid) {
        continue;
      }
      const matchingMessages = messagesByGuid.get(message.guid);
      if (matchingMessages) {
        matchingMessages.push(message);
      } else {
        messagesByGuid.set(message.guid, [message]);
      }
      if (message.chat_id !== null) {
        chatIds.add(message.chat_id);
      }
    }
    const targetGuids = [...messagesByGuid.keys()];
    if (!targetGuids.length || !chatIds.size) {
      return;
    }

    const normalizedTargetGuid = sql<string>`CASE
      WHEN reaction.associated_message_guid LIKE 'bp:%'
        THEN SUBSTR(reaction.associated_message_guid, 4)
      WHEN reaction.associated_message_guid LIKE 'p:%/%'
        THEN SUBSTR(reaction.associated_message_guid, INSTR(reaction.associated_message_guid, '/') + 1)
      ELSE reaction.associated_message_guid
    END`;
    const reactionRows: Array<{
      associated_message_guid: string | null;
      associated_message_type: number | null;
      handle_id: number | null;
      is_from_me: number | null;
      reaction_guid: string;
      reaction_message_id: number;
    }> = [];
    for (let offset = 0; offset < targetGuids.length; offset += TAPBACK_GUID_QUERY_PAGE_SIZE) {
      const guidPage = targetGuids.slice(offset, offset + TAPBACK_GUID_QUERY_PAGE_SIZE);
      const page = await this.db
        .selectFrom("message as reaction")
        .innerJoin("chat_message_join as reaction_cmj", "reaction_cmj.message_id", "reaction.ROWID")
        .select([
          "reaction.associated_message_guid",
          "reaction.associated_message_type",
          "reaction.handle_id",
          "reaction.is_from_me",
          "reaction.guid as reaction_guid",
        ])
        .select(sql<number>`reaction.ROWID`.as("reaction_message_id"))
        .where("reaction_cmj.chat_id", "in", [...chatIds])
        .where(
          sql<boolean>`(
            reaction.associated_message_type BETWEEN ${TAPBACK_ADD_TYPE_MIN} AND ${TAPBACK_ADD_TYPE_MAX}
            OR reaction.associated_message_type BETWEEN ${TAPBACK_REMOVE_TYPE_MIN} AND ${TAPBACK_REMOVE_TYPE_MAX}
          )`,
        )
        .where(normalizedTargetGuid, "in", guidPage)
        .distinct()
        .orderBy(sql`COALESCE(reaction.date, ${sql.raw(NULL_MESSAGE_DATE_SQL)})`, "asc")
        .orderBy("reaction.ROWID", "asc")
        .execute();
      reactionRows.push(...page);
    }

    const tapbacksByTargetAndActor = new Map<string, Map<string, MessageTapback>>();
    for (const reaction of reactionRows) {
      const targetGuid = normalizeTapbackTargetGuid(reaction.associated_message_guid);
      const associatedType = reaction.associated_message_type;
      if (!targetGuid || !isTapbackMessageType(associatedType)) {
        continue;
      }
      const isFromMe = Boolean(reaction.is_from_me);
      const actorKey = isFromMe ? "me" : `handle:${reaction.handle_id ?? "unknown"}`;
      const actorTapbacks = tapbacksByTargetAndActor.get(targetGuid) ?? new Map<string, MessageTapback>();
      tapbacksByTargetAndActor.set(targetGuid, actorTapbacks);
      const baseType = associatedType >= TAPBACK_REMOVE_TYPE_MIN ? associatedType - 1_000 : associatedType;
      if (associatedType >= TAPBACK_REMOVE_TYPE_MIN) {
        if (actorTapbacks.get(actorKey)?.type === baseType) {
          actorTapbacks.delete(actorKey);
        }
        continue;
      }
      actorTapbacks.set(actorKey, {
        handle_id: reaction.handle_id,
        is_from_me: isFromMe,
        reaction_guid: reaction.reaction_guid,
        type: baseType,
      });
    }

    for (const [targetGuid, actorTapbacks] of tapbacksByTargetAndActor) {
      const tapbacks = [...actorTapbacks.values()].sort(
        (left, right) => left.type - right.type || Number(right.is_from_me) - Number(left.is_from_me),
      );
      for (const message of messagesByGuid.get(targetGuid) ?? []) {
        message.tapbacks = tapbacks;
      }
    }
  };

  private addReplyOriginsToMessages = async <
    T extends {
      guid: string | null;
      reply_origin?: MessageReplyOrigin;
      thread_originator_guid: string | null;
    },
  >(
    messages: T[],
  ) => {
    const messagesByGuid = new Map(
      messages.flatMap((message) => (message.guid ? [[message.guid, message] as const] : [])),
    );
    const originGuids = uniq(
      messages
        .map((message) => message.thread_originator_guid)
        .filter((guid): guid is string => typeof guid === "string" && guid.length > 0),
    );
    if (!originGuids.length) {
      return;
    }

    const originRows: Array<{
      attributedBody: Uint8Array | null;
      filename: string | null;
      guid: string;
      handle_id: number | null;
      is_from_me: number | null;
      message_id: number;
      mime_type: string | null;
      text: string | null;
      transfer_name: string | null;
    }> = [];
    for (let offset = 0; offset < originGuids.length; offset += MESSAGE_GUID_QUERY_PAGE_SIZE) {
      const guidPage = originGuids.slice(offset, offset + MESSAGE_GUID_QUERY_PAGE_SIZE);
      const page = await this.db
        .selectFrom("message as origin")
        .leftJoin("message_attachment_join as origin_maj", "origin_maj.message_id", "origin.ROWID")
        .leftJoin("attachment as origin_attachment", "origin_attachment.ROWID", "origin_maj.attachment_id")
        .select([
          "origin.attributedBody",
          "origin.guid",
          "origin.handle_id",
          "origin.is_from_me",
          "origin.text",
          "origin_attachment.filename",
          "origin_attachment.mime_type",
          "origin_attachment.transfer_name",
        ])
        .select(sql<number>`origin.ROWID`.as("message_id"))
        .where("origin.guid", "in", guidPage)
        .orderBy("origin_attachment.ROWID", "asc")
        .execute();
      originRows.push(...page);
    }

    const originsByGuid = new Map<string, MessageReplyOrigin>();
    for (const row of originRows) {
      if (originsByGuid.has(row.guid)) {
        continue;
      }
      let text = row.text?.replace(/[\u{FFFC}-\u{FFFD}]/gu, "").trim() || null;
      if (!text && row.attributedBody) {
        try {
          text = (await getTextFromBuffer(row.attributedBody))?.replace(/[\u{FFFC}-\u{FFFD}]/gu, "").trim() || null;
        } catch {
          // A missing reply preview is preferable to failing the whole page.
        }
      }
      const mimeType = row.mime_type?.toLocaleLowerCase() || "";
      const attachmentLabel =
        row.filename || row.transfer_name
          ? mimeType.startsWith("image/")
            ? "Photo"
            : mimeType.startsWith("video/")
              ? "Video"
              : mimeType.startsWith("audio/")
                ? "Audio"
                : row.transfer_name || row.filename?.split("/").at(-1) || "Attachment"
          : null;
      originsByGuid.set(row.guid, {
        attachmentLabel,
        guid: row.guid,
        handle_id: row.handle_id,
        is_from_me: Boolean(row.is_from_me),
        message_id: row.message_id,
        text,
      });
    }

    for (const message of messages) {
      const originGuid = message.thread_originator_guid;
      if (!originGuid) {
        continue;
      }
      const loadedOrigin = messagesByGuid.get(originGuid);
      message.reply_origin =
        originsByGuid.get(originGuid) ??
        (loadedOrigin
          ? {
              attachmentLabel: null,
              guid: originGuid,
              handle_id: null,
              is_from_me: false,
              message_id: null,
              text: null,
            }
          : {
              attachmentLabel: null,
              guid: originGuid,
              handle_id: null,
              is_from_me: false,
              message_id: null,
              text: "Message",
            });
    }
  };

  private enhanceMessageResponses = async <T extends JoinedMessageType = JoinedMessageType>(messages: T[]) => {
    type EnhancedMessage = T & {
      attachmentMessages?: EnhancedMessage[];
      date_obj?: Date;
      date_obj_delivered?: Date;
      date_obj_read?: Date;
      link_metadata?: NonNullable<ReturnType<typeof parseRichLinkMetadata>>;
      reply_origin?: MessageReplyOrigin;
      tapbacks?: MessageTapback[];
    };

    const enhancedMessages = messages as EnhancedMessage[];

    const messageOrder = new Map<(typeof enhancedMessages)[number]["message_id"], number>();
    for (let index = 0; index < enhancedMessages.length; index += 1) {
      const messageId = enhancedMessages[index].message_id;
      if (!messageOrder.has(messageId)) {
        messageOrder.set(messageId, index);
      }
    }

    await Promise.all(
      enhancedMessages.map(async (message) => {
        this.addDateToMessage(message);
        if (message.text) {
          message.text = message.text.replace(/[\u{FFFC}-\u{FFFD}]/gu, "");
        }

        try {
          if (message.attributedBody && (!message.text || message.filename)) {
            message.text = await getTextFromBuffer(message.attributedBody);
          }
        } catch {
          // ignore
        }
        if (message.balloon_bundle_id === "com.apple.messages.URLBalloonProvider" && message.payload_data) {
          message.link_metadata = parseRichLinkMetadata(message.payload_data) ?? undefined;
        }
      }),
    );
    const groupedMessages = groupBy(enhancedMessages, "message_id");
    const values = Object.values(groupedMessages) as EnhancedMessage[][];
    const flat = values.map((messages) => {
      if (messages.length === 1) {
        return messages[0];
      }
      const messageToUse = messages[0];
      messageToUse.attachmentMessages = messages.slice(1);
      return messageToUse;
    }) as EnhancedMessage[];

    await Promise.all([this.addTapbacksToMessages(flat), this.addReplyOriginsToMessages(flat)]);

    return flat.sort(
      (a, b) =>
        (messageOrder.get(a.message_id) ?? Number.MAX_SAFE_INTEGER) -
        (messageOrder.get(b.message_id) ?? Number.MAX_SAFE_INTEGER),
    );
  };

  getAllMessageTexts = async (limit?: number, offset?: number) => {
    const textIndex = await this.getCompleteTextIndex();
    return textIndex.getDistinctTexts(limit, offset);
  };

  countAllMessageTexts = async (): Promise<number> => {
    const textIndex = await this.getCompleteTextIndex();
    return textIndex.countDistinctTexts();
  };

  getAllMessageTextRecords = async (limit?: number, offset?: number): Promise<MessageTextRecord[]> => {
    const textIndex = await this.getCompleteTextIndex();
    return textIndex.getTextRecords(limit, offset);
  };

  countAllMessageTextRecords = async (): Promise<number> => {
    const textIndex = await this.getCompleteTextIndex();
    return textIndex.countTextRecords();
  };

  getTextIndexSnapshotId = async (): Promise<string> => {
    const textIndex = await this.getCompleteTextIndex();
    const status = textIndex.getStatus();
    if (!status?.complete || !status.sourceFingerprint) {
      throw new Error("Message text index snapshot is not complete");
    }
    return status.sourceFingerprint;
  };

  getAllMessageTextsForFilters = async (
    chatIds?: number[],
    handleIds?: number[],
    startDate?: Date | null,
    endDate?: Date | null,
  ): Promise<string[]> => {
    const textIndex = await this.getCompleteTextIndex();
    return textIndex.getDistinctTextsForFilters(this.getTextSearchFilters(chatIds, handleIds, startDate, endDate));
  };

  getMessageTextScopeForFilters = async (
    chatIds?: number[],
    handleIds?: number[],
    startDate?: Date | null,
    endDate?: Date | null,
  ): Promise<FilteredMessageTextScope> => {
    const textIndex = await this.getCompleteTextIndex();
    return textIndex.getMessageTextScopeForFilters(this.getTextSearchFilters(chatIds, handleIds, startDate, endDate));
  };

  calculateSemanticSearchStats = async () => {
    const allText = await this.getAllMessageTexts();
    return getStatsForText(allText);
  };
  getMessagesForChatId = async (chatId: number | number[]) => {
    const messages = await this.getJoinedMessageQuery()
      .where("chat_message_join.chat_id", "in", [chatId].flat())
      .where(
        sql<boolean>`COALESCE(message.associated_message_type, 0) NOT BETWEEN ${TAPBACK_ADD_TYPE_MIN} AND ${TAPBACK_REMOVE_TYPE_MAX}`,
      )
      .execute();
    const enhanced = await this.enhanceMessageResponses(messages);
    enhanced.sort((a, b) => {
      return (a.date || 0) - (b.date || 0);
    });
    return enhanced;
  };

  getMessagesPage = async (chatId: number | number[], options: MessagePageOptions = {}) => {
    const chatIds = this.normalizeChatIds(chatId);
    const emptyPage = {
      messages: [] as Awaited<ReturnType<SQLDatabase["getMessagesForChatId"]>>,
      oldestPredecessor: null as MessagePageBoundaryContext | null,
      newestSuccessor: null as MessagePageBoundaryContext | null,
      olderCursor: null as MessagePageCursor | null,
      newerCursor: null as MessagePageCursor | null,
      hasOlder: false,
      hasNewer: false,
      // Compatibility for the original one-direction page contract.
      hasMore: false,
    };
    if (!chatIds.length) {
      return emptyPage;
    }
    if (!options || typeof options !== "object" || Array.isArray(options)) {
      throw new Error("Invalid message page options");
    }

    const limit = this.getBoundedLimit(options.limit, DEFAULT_MESSAGE_PAGE_SIZE, MAX_MESSAGE_PAGE_SIZE);
    const cursor = this.validateMessagePageCursor(options.cursor);
    const anchorMessageId = options.anchorMessageId;
    if (anchorMessageId !== undefined && (!Number.isSafeInteger(anchorMessageId) || anchorMessageId <= 0)) {
      throw new Error("Invalid anchor message ID");
    }
    if (options.direction !== undefined && options.direction !== "newer" && options.direction !== "older") {
      throw new Error("Invalid message page direction");
    }
    if (options.position !== undefined && options.position !== "latest" && options.position !== "oldest") {
      throw new Error("Invalid message page position");
    }
    if (anchorMessageId !== undefined && (cursor || options.direction || options.position)) {
      throw new Error("An anchor message cannot be combined with a cursor, direction, or position");
    }
    if (cursor && options.position) {
      throw new Error("A message cursor cannot be combined with a position");
    }
    if (!cursor && options.direction) {
      throw new Error("A message page direction requires a cursor");
    }

    let selectedKeys: MessagePageKey[];
    let hasOlder = false;
    let hasNewer = false;
    let needsOppositeDirectionCheck: "newer" | "older" | undefined;
    if (anchorMessageId !== undefined) {
      const anchorKey = await this.getMessagePageKeysQuery(chatIds)
        .where("message.ROWID", "=", anchorMessageId)
        .limit(1)
        .executeTakeFirst();
      if (!anchorKey) {
        return emptyPage;
      }

      const anchorCursor = this.messagePageKeyToCursor(anchorKey);
      const [olderKeys, newerKeys] = await Promise.all([
        this.getMessagePageKeys(chatIds, anchorCursor, "older", limit + 1),
        this.getMessagePageKeys(chatIds, anchorCursor, "newer", limit + 1),
      ]);
      const desiredOlder = Math.floor((limit - 1) / 2);
      const desiredNewer = limit - 1 - desiredOlder;
      let olderCount = Math.min(desiredOlder, olderKeys.length);
      let newerCount = Math.min(desiredNewer, newerKeys.length);
      let remaining = limit - 1 - olderCount - newerCount;
      const additionalOlder = Math.min(remaining, olderKeys.length - olderCount);
      olderCount += additionalOlder;
      remaining -= additionalOlder;
      newerCount += Math.min(remaining, newerKeys.length - newerCount);
      selectedKeys = [...olderKeys.slice(0, olderCount), anchorKey, ...newerKeys.slice(0, newerCount)];
      hasOlder = olderKeys.length > olderCount;
      hasNewer = newerKeys.length > newerCount;
    } else if (cursor) {
      const direction = options.direction ?? "older";
      const requestedKeys = await this.getMessagePageKeys(chatIds, cursor, direction, limit + 1);
      selectedKeys = requestedKeys.slice(0, limit);
      if (direction === "older") {
        hasOlder = requestedKeys.length > limit;
        needsOppositeDirectionCheck = "newer";
      } else {
        hasNewer = requestedKeys.length > limit;
        needsOppositeDirectionCheck = "older";
      }
    } else {
      const direction = options.position === "oldest" ? "newer" : "older";
      const requestedKeys = await this.getMessagePageKeys(chatIds, undefined, direction, limit + 1);
      selectedKeys = requestedKeys.slice(0, limit);
      if (direction === "older") {
        hasOlder = requestedKeys.length > limit;
      } else {
        hasNewer = requestedKeys.length > limit;
      }
    }

    if (!selectedKeys.length) {
      return emptyPage;
    }
    const chronologicalKeys = this.sortMessagePageKeysChronologically(selectedKeys);
    const oldestKey = chronologicalKeys[0];
    const newestKey = chronologicalKeys[chronologicalKeys.length - 1];
    const oppositeDirectionCheck = needsOppositeDirectionCheck
      ? this.getMessagePageKeys(
          chatIds,
          this.messagePageKeyToCursor(needsOppositeDirectionCheck === "older" ? oldestKey : newestKey),
          needsOppositeDirectionCheck,
          1,
        )
      : Promise.resolve([]);
    const [oppositeDirectionKeys, messageRows, oldestPredecessor, newestSuccessor] = await Promise.all([
      oppositeDirectionCheck,
      this.orderJoinedMessagesChronologically(
        this.getJoinedMessageQueryForChatIds(chatIds).where(
          "message.ROWID",
          "in",
          chronologicalKeys.map((key) => key.message_id),
        ),
      ).execute(),
      this.getMessagePageBoundaryContext(chatIds, oldestKey, "older"),
      this.getMessagePageBoundaryContext(chatIds, newestKey, "newer"),
    ]);
    const messages = this.stripMessageTransportBlobs(await this.enhanceMessageResponses(messageRows));
    if (needsOppositeDirectionCheck === "older") {
      hasOlder = oppositeDirectionKeys.length > 0;
    } else if (needsOppositeDirectionCheck === "newer") {
      hasNewer = oppositeDirectionKeys.length > 0;
    }
    return {
      messages,
      oldestPredecessor,
      newestSuccessor,
      olderCursor: hasOlder ? this.messagePageKeyToCursor(oldestKey) : null,
      newerCursor: hasNewer ? this.messagePageKeyToCursor(newestKey) : null,
      hasOlder,
      hasNewer,
      hasMore: hasOlder,
    };
  };

  searchMessagesForChatId = async (chatId: number | number[], query: string, regex: boolean, limit?: number) => {
    const chatIds = this.normalizeChatIds(chatId);
    if (!chatIds.length) {
      return [];
    }
    if (typeof query !== "string" || query.length > MAX_THREAD_SEARCH_QUERY_LENGTH) {
      throw new Error("Invalid thread search query");
    }
    if (typeof regex !== "boolean") {
      throw new Error("Invalid thread search mode");
    }
    if (!query) {
      return [];
    }

    const boundedLimit = this.getBoundedLimit(
      limit,
      DEFAULT_THREAD_SEARCH_RESULT_LIMIT,
      MAX_THREAD_SEARCH_RESULT_LIMIT,
    );
    const textIndex = await this.getCompleteTextIndex();
    const filters: TextSearchFilters = { chatIds };
    const matchingGuids = uniq(
      regex
        ? await textIndex.searchRegex(query, filters, boundedLimit)
        : await textIndex.searchSubstring(query, filters, boundedLimit),
    );
    if (!matchingGuids.length) {
      return [];
    }

    const messageRows = await this.orderJoinedMessagesChronologically(
      this.getJoinedMessageQueryForChatIds(chatIds).where("message.guid", "in", matchingGuids),
    ).execute();
    return this.stripMessageTransportBlobs(await this.enhanceMessageResponses(messageRows));
  };

  private getMessageQueryByYear = (year: number, chatIds?: number[]) => {
    const db = this.db;

    // we want every query to have its associated handles/chats
    let query = db
      .selectFrom("message")
      .innerJoin("chat_message_join as cmj", "cmj.message_id", "message.ROWID")
      .innerJoin("chat as c", "c.ROWID", "cmj.chat_id");
    if (year !== 0) {
      const startOfYear = new Date(year, 0, 1).getTime();
      const endOfYear = new Date(year + 1, 0, 1).getTime();

      const startOffset = (startOfYear - 978307200000) * 1000000;
      const endOffset = (endOfYear - 978307200000) * 1000000;
      query = query.where("message.date", ">=", startOffset).where("message.date", "<", endOffset);
    }
    if (chatIds && chatIds.length) {
      query = query.where("c.ROWID", "in", chatIds);
    }
    return query;
  };

  private countMessagesByYear = async (year: number, chatIds?: number[]) => {
    const queryByOriginator = async (isFromMe: boolean) => {
      const query = this.getMessageQueryByYear(year, chatIds)
        .select((e) => e.fn.count("message.ROWID").as("count"))
        .where("is_from_me", "=", Number(isFromMe));

      const result = await query.execute();
      const count = result[0]?.count;
      return Number(count || 0);
    };
    const [sent, received] = await Promise.all([queryByOriginator(true), queryByOriginator(false)]);
    return { sent, received };
  };

  private countMessagesByTimeBuckets = async (year: number, chatIds?: number[]) => {
    const rows = await this.getMessageQueryByYear(year, chatIds)
      .select((e) => e.fn.count("message.ROWID").as("message_count"))
      .select([
        "message.is_from_me",
        sql<
          number | null
        >`cast(strftime('%Y', DATETIME(message.date / 1000000000 + 978307200, 'unixepoch', 'localtime')) as integer)`.as(
          "calendar_year",
        ),
        sql<
          number | null
        >`cast(strftime('%m', DATETIME(message.date / 1000000000 + 978307200, 'unixepoch', 'localtime')) as integer)`.as(
          "month_number",
        ),
        sql<
          number | null
        >`cast(strftime('%H', DATETIME(message.date / 1000000000 + 978307200, 'unixepoch', 'localtime')) as integer)`.as(
          "hour",
        ),
        sql<
          number | null
        >`cast(strftime('%w', DATETIME(message.date / 1000000000 + 978307200, 'unixepoch', 'localtime')) as integer)`.as(
          "weekday_number",
        ),
      ])
      .where("message.date", "is not", null)
      .where("is_from_me", "in", [0, 1])
      .groupBy(["calendar_year", "month_number", "hour", "weekday_number", "message.is_from_me"])
      .execute();

    const calendarYears = new Map<number, number>();
    const hourlyCounts = Array<number>(24).fill(0);
    const monthlyCounts = {
      received: new Map<number, number>(),
      sent: new Map<number, number>(),
    };
    const weekdayCounts = {
      received: new Map<number, number>(),
      sent: new Map<number, number>(),
    };

    for (const row of rows) {
      const count = Number(row.message_count || 0);
      const calendarYear = Number(row.calendar_year);
      const month = Number(row.month_number) - 1;
      const hour = Number(row.hour);
      const weekday = Number(row.weekday_number);
      const origin = Number(row.is_from_me) === 1 ? "sent" : "received";

      if (year === 0 && Number.isInteger(calendarYear)) {
        calendarYears.set(calendarYear, (calendarYears.get(calendarYear) || 0) + count);
      }
      if (Number.isInteger(month) && month >= 0 && month < WRAPPED_MONTH_NAMES.length) {
        monthlyCounts[origin].set(month, (monthlyCounts[origin].get(month) || 0) + count);
      }
      if (Number.isInteger(hour) && hour >= 0 && hour < hourlyCounts.length) {
        hourlyCounts[hour] += count;
      }
      if (Number.isInteger(weekday) && weekday >= 0 && weekday < WRAPPED_WEEKDAY_NAMES.length) {
        weekdayCounts[origin].set(weekday, (weekdayCounts[origin].get(weekday) || 0) + count);
      }
    }

    const toNamedInteractions = <Key extends "month" | "weekday">(
      counts: Map<number, number>,
      names: string[],
      key: Key,
    ) =>
      Array.from(
        counts,
        ([index, message_count]) =>
          ({ [key]: names[index], message_count }) as Record<Key, string> & { message_count: number },
      ).sort((left, right) => right.message_count - left.message_count);

    return {
      calendarYearCounts: Array.from(calendarYears, ([calendarYear, count]) => ({ year: calendarYear, count })).sort(
        (left, right) => left.year - right.year,
      ),
      hourlyCounts,
      monthlyInteractions: {
        received: toNamedInteractions(monthlyCounts.received, WRAPPED_MONTH_NAMES, "month"),
        sent: toNamedInteractions(monthlyCounts.sent, WRAPPED_MONTH_NAMES, "month"),
      },
      weekdayInteractions: {
        received: toNamedInteractions(weekdayCounts.received, WRAPPED_WEEKDAY_NAMES, "weekday"),
        sent: toNamedInteractions(weekdayCounts.sent, WRAPPED_WEEKDAY_NAMES, "weekday"),
      },
    };
  };

  private countMessagesByChat = async (year: number, chatIds?: number[]) => {
    const queryByOriginator = (isFromMe: boolean) => {
      return this.getMessageQueryByYear(year, chatIds)
        .select((e) => e.fn.count("message.ROWID").as("message_count"))
        .select("c.ROWID as chat_id")
        .where("is_from_me", "=", Number(isFromMe))
        .groupBy("chat_id")
        .orderBy("message_count", "desc");
    };

    const [sent, received] = await Promise.all([queryByOriginator(true).execute(), queryByOriginator(false).execute()]);
    return { sent, received };
  };

  private countMessagesByHandle = async (year: number, chatIds?: number[]) => {
    if (!chatIds || !chatIds.length) {
      return null;
    }
    const queryByOriginator = async (isFromMe: boolean) => {
      const query = this.getMessageQueryByYear(year, chatIds)
        .select((e) => e.fn.count("message.ROWID").as("message_count"))
        .select("message.handle_id as handle_id")
        .leftJoin("handle", "handle.ROWID", "message.handle_id")
        .where("is_from_me", "=", Number(isFromMe))
        .groupBy("message.handle_id")
        .orderBy("message_count", "desc");
      const data = await query.execute();
      return data;
    };

    const [sent, received] = await Promise.all([queryByOriginator(true), queryByOriginator(false)]);
    return { sent, received };
  };

  private lateNightMessenger = async (year: number, chatIds?: number[]) => {
    const getByOriginator = async (fromMe: boolean) => {
      const query = this.getMessageQueryByYear(year, chatIds)
        .select("c.ROWID as chat_id")
        .select((e) => e.fn.count("message.ROWID").as("message_count"))
        .select(
          sql<number>`cast(strftime('%H', DATETIME(date / 1000000000 + 978307200, 'unixepoch', 'localtime')) as integer)`.as(
            "hour",
          ),
        )
        // @ts-ignore
        .where("hour", "<", 5)
        .where("is_from_me", "=", Number(fromMe))
        .groupBy("chat_id")
        .orderBy("message_count", "desc");

      const data = await query.execute();
      const grouped = groupBy(data, "chat_id");
      return Object.entries(grouped).map(([chat_id, messages]) => {
        const message_count = messages.reduce((acc, curr) => acc + Number(curr.message_count || 0) || 0, 0);
        return { chat_id: Number(chat_id), message_count };
      }) as Array<Omit<(typeof data)[number], "hour">>;
    };

    const [received, sent] = await Promise.all([getByOriginator(false), getByOriginator(true)]);
    return { received, sent };
  };

  private getMostPopularOpeners = async (year: number, chatIds?: number[]) => {
    // Fetch both directions together, retaining the indexed first-date lookup
    // and every opener when a chat's earliest message dates tie.
    const chats = await this.getMessageQueryByYear(year, chatIds)
      .where((eb) =>
        eb(
          "cmj.message_date",
          "=",
          eb
            .selectFrom("chat_message_join as cmj2")
            .select((select) => select.fn.min("cmj2.message_date").as("min_date"))
            .whereRef("cmj2.chat_id", "=", "c.ROWID"),
        ),
      )
      .select(["message.is_from_me", "text", "attributedBody"])
      .where("message.is_from_me", "in", [0, 1])
      .orderBy("message.date", "asc")
      .execute();
    await Promise.all(
      chats.map(async (chat) => {
        if (!chat.text && chat.attributedBody) {
          chat.text = await getTextFromBuffer(chat.attributedBody);
        }
      }),
    );
    const getByOriginator = (fromMe: boolean) => {
      const openers = chats.flatMap((chat) => {
        if (chat.is_from_me !== Number(fromMe)) {
          return [];
        }
        const text = (chat.text || "")
          .trim()
          .toLowerCase()
          .replace(/[\u{FFFC}-\u{FFFD}]/gu, "");
        return text ? [text] : [];
      });
      const counted = countBy(openers, (o) => o);
      for (const key of Object.keys(counted)) {
        if (counted[key] < 2) {
          delete counted[key];
        }
      }
      return Object.entries(counted)
        .map(([text, count]) => ({ text, count }))
        .sort((a, b) => b.count - a.count);
    };
    return { received: getByOriginator(false), sent: getByOriginator(true) };
  };

  calculateWrappedStats = async (year: number, chatIds?: number[]) => {
    const [messageCount, chatInteractions, handleInteractions, timeBuckets, lateNightInteractions, mostPopularOpeners] =
      await Promise.all([
        this.countMessagesByYear(year, chatIds),
        this.countMessagesByChat(year, chatIds),
        this.countMessagesByHandle(year, chatIds),
        this.countMessagesByTimeBuckets(year, chatIds),
        this.lateNightMessenger(year, chatIds),
        this.getMostPopularOpeners(year, chatIds),
      ]);

    const { calendarYearCounts, hourlyCounts, monthlyInteractions, weekdayInteractions } = timeBuckets;

    const monthlyCounts = Array<number>(12).fill(0);
    for (const interaction of [...monthlyInteractions.sent, ...monthlyInteractions.received]) {
      const monthIndex = WRAPPED_MONTH_INDEX[interaction.month];
      if (monthIndex !== undefined) {
        monthlyCounts[monthIndex] += Number(interaction.message_count || 0);
      }
    }

    const handleCounts = new Map<number, number>();
    if (handleInteractions) {
      const sentCount = handleInteractions.sent.reduce(
        (count, interaction) => count + Number(interaction.message_count || 0),
        0,
      );
      if (sentCount > 0) {
        handleCounts.set(0, sentCount);
      }
      for (const interaction of handleInteractions.received) {
        const handleId = Number(interaction.handle_id);
        if (Number.isInteger(handleId) && handleId > 0) {
          handleCounts.set(handleId, (handleCounts.get(handleId) || 0) + Number(interaction.message_count || 0));
        }
      }
    }
    const handleChartCounts = Array.from(handleCounts, ([handleId, count]) => ({ handleId, count })).sort(
      (left, right) => right.count - left.count || left.handleId - right.handleId,
    );

    return {
      messageCount,
      chatInteractions,
      handleInteractions,
      weekdayInteractions,
      monthlyInteractions,
      lateNightInteractions,
      mostPopularOpeners,
      chartStats: {
        byYear: calendarYearCounts,
        byMonth: monthlyCounts,
        byHour: hourlyCounts,
        byHandle: handleChartCounts,
      },
    };
  };

  calculateSlowWrappedStats = async (year: number, chatIds?: number[]) => {
    const textIndex = await this.getCompleteTextIndex();
    const allText = await textIndex.getDistinctTextsForYearAndChats(year, chatIds);

    const counts: Record<string, number> = {};
    for (const text of allText) {
      // clean text, replace all forms of quotes with nothing
      const s = text.toLowerCase().replace(/[\u{2018}-\u{201F}]/gu, "");
      const words = removeStopWords(s.split(/\s+/g));
      for (const word of words) {
        if (!counts[word]) {
          counts[word] = 0;
        }
        counts[word]++;
      }
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const topOneHundred = sorted.slice(0, 100);
    const topEmojis = sorted.filter(([key]) => key.match(/[\u{1F600}-\u{1F64F}]/gu));
    return {
      topOneHundred,
      topEmojis,
    };
  };
}

const db = new SQLDatabase("Messages DB", appMessagesDbCopy);

// monkey patch to handle ipc calls

export default db;
