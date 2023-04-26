import type { SelectQueryBuilder, Kysely } from "kysely";
import { sql } from "kysely";
import type { DB as MesssagesDatabase } from "../../_generated/types";
import logger from "../utils/logger";
import { countBy, groupBy, uniq } from "lodash-es";
import type { Contact } from "electron-mac-contacts";
import { decodeMessageBuffer, getTextFromBuffer } from "../utils/buffer";
import { appMessagesDbCopy } from "../utils/constants";
import { getStatsForText } from "../semantic-search/semantic-search-stats";
import { removeStopWords } from "../utils/text";
import BaseDatabase from "./base-database";

type ExtractO<T> = T extends SelectQueryBuilder<any, any, infer O> ? O : never;
type JoinedMessageType = ExtractO<ReturnType<SQLDatabase["getJoinedMessageQuery"]>>;

export class SQLDatabase extends BaseDatabase<MesssagesDatabase> {
  private getChatsWithMessagesQuery = () => {
    const db = this.db;
    return db
      .selectFrom("chat as c")
      .select(["c.ROWID as chat_id", "c.guid as chat_guid"])
      .innerJoin("chat_message_join as cmj", "c.ROWID", "cmj.chat_id")
      .innerJoin("message as m", "cmj.message_id", "m.ROWID")
      .select(["m.date as latest_message_date", "text", "attributedBody", "chat_identifier", "display_name"]);
  };

  getChatList = async () => {
    const db = this.db;
    const query = this.getChatsWithMessagesQuery()
      .where((eb) => {
        return eb.cmpr(
          "cmj.message_date",
          "=",
          eb
            .selectFrom("chat_message_join as cmj2")
            .select((e) => e.fn.max("cmj2.message_date").as("max_date"))
            .where("cmj2.chat_id", "=", eb.ref("c.ROWID")),
        );
      })
      .orderBy("m.date", "desc");
    const chats = await query.execute();
    const handles = await db
      .selectFrom("handle")
      .leftJoin("chat_handle_join", "handle.ROWID", "chat_handle_join.handle_id")
      .selectAll()
      .execute();
    type Handles = Array<(typeof handles)[number] & { contact?: Contact | null }>;
    type EnhancedChat = (typeof chats)[number] & { handles: Handles; name: string; sameParticipantChatIds: number[] };
    const handlesByChatId = groupBy(handles, "chat_id");
    const enhancedChats = chats as EnhancedChat[];
    for (const chat of enhancedChats) {
      chat.handles = handlesByChatId[chat.chat_id as keyof typeof handlesByChatId] || [];
      if (!chat.text && chat.attributedBody) {
        chat.text = await getTextFromBuffer(chat.attributedBody);
      }
    }
    return enhancedChats;
  };

  getEarliestMessageDate = async () => {
    const db = this.db;
    const query = db
      .selectFrom("message")
      .select((e) => e.fn.min("date").as("min_date"))
      .selectAll();
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
        "is_read",
        "item_type",
        "filename",
        "error",
        "payload_data",
        "message.service as service",
        "text",
        "transfer_name",
        "type",
      ])
      .select(sql<number>`message.ROWID`.as("message_id"));
  };

  getMessageGuidsFromRowIds = async (messageIds: number[]) => {
    const db = this.db;
    const query = db.selectFrom("message").select(["guid", "ROWID"]).where("ROWID", "in", messageIds).limit(10000);
    const results = await query.execute();
    const indexMap = new Map<number, number>();
    for (let i = 0; i < messageIds.length; i++) {
      indexMap.set(messageIds[i], i);
    }
    results.sort((a, b) => {
      const aIndex = indexMap.get(a.ROWID!);
      const bIndex = indexMap.get(b.ROWID!);
      if (aIndex === undefined || bIndex === undefined) {
        return 0;
      }
      return aIndex - bIndex;
    });
    return results.map((r) => r.guid);
  };

  globalSearchTextBased = async (
    searchTerm: string,
    chatIds?: number[],
    handleIds?: number[],
    startDate?: Date | null,
    endDate?: Date | null,
  ) => {
    const db = this.db;
    const cleanedQuery = searchTerm.replace(/[^a-zA-Z0-9 ]/g, "");
    const textMatch = await db
      .selectFrom("message_fts")
      .select(["message_id"])
      .where("text", "match", cleanedQuery)
      .orderBy(sql`rank`, "asc")
      .limit(1000)
      .execute();
    const messageGuids = textMatch.map((m) => m.message_id as string);
    const query = this.getFilteredSearchQuery({ chatIds, handleIds, startDate, endDate })
      .where(({ or, cmpr }) => {
        return or([cmpr("filename", "like", "%" + searchTerm + "%"), cmpr("text", "like", "%" + searchTerm + "%")]);
      })
      .limit(1000);
    const alternateResults = await query.execute();
    const alternateMessageGuids = alternateResults.map((m) => m.guid as string);
    const allMessageGuids = uniq([...messageGuids, ...alternateMessageGuids]);
    return this.fullTextMessageSearchWithGuids(allMessageGuids, searchTerm, chatIds, handleIds, startDate, endDate);
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

    const hasChatIds = Boolean(chatIds?.length);
    const hasHandleIds = Boolean(handleIds?.length);
    if (hasChatIds || hasHandleIds) {
      query = query.where(({ or, cmpr }) => {
        const expressions = [];

        if (hasChatIds) {
          expressions.push(cmpr("chat_id", "in", chatIds!));
        }
        if (handleIds?.length) {
          expressions.push(cmpr("handle_id", "in", handleIds!));
        }
        return or(expressions);
      });
    }

    if (startDate) {
      const offset = (startDate.getTime() - 978307200000) * 1000000;
      query = query.where("date", ">", offset);
    }

    if (endDate) {
      const offset = (endDate.getTime() - 978307200000) * 1000000;
      query = query.where("date", "<", offset);
    }

    return query;
  };
  fullTextMessageSearchWithGuids = async (
    messageGuids: string[],
    searchTerm: string,
    chatIds?: number[],
    handleIds?: number[],
    startDate?: Date | null,
    endDate?: Date | null,
  ) => {
    const query = this.getFilteredSearchQuery({ chatIds, handleIds, startDate, endDate }).where(
      "message.guid",
      "in",
      messageGuids,
    );

    const messages = await query.limit(10000).execute();
    const indexMap = new Map<string, number>();
    for (let i = 0; i < messageGuids.length; i++) {
      indexMap.set(messageGuids[i], i);
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
  private enhanceMessageResponses = async <T extends JoinedMessageType = JoinedMessageType>(messages: T[]) => {
    type EnhancedMessage = T & {
      attachmentMessages?: EnhancedMessage[];
      date_obj?: Date;
      date_obj_delivered?: Date;
      date_obj_read?: Date;
    };

    const enhancedMessages = messages as EnhancedMessage[];

    const messageGuids = enhancedMessages.map((m) => m.guid);

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

    return flat.sort((a, b) => {
      return messageGuids.indexOf(a.guid) - messageGuids.indexOf(b.guid);
    });
  };

  private baseAllMessageQuery = () => {
    return this.db
      .selectFrom("message")
      .where("text", "is not", "")
      .where("text", "is not", null)
      .where("item_type", "not in", [1, 3, 4, 5, 6])
      .where("associated_message_type", "=", 0)
      .orderBy("ROWID", "desc");
  };

  getMessageIds = async (limit?: number, offset?: number) => {
    let query = this.baseAllMessageQuery().select("ROWID").distinct();
    if (limit) {
      query = query.limit(limit);
    }
    if (offset) {
      query = query.offset(offset);
    }
    return (await query.execute()).map((r) => r.ROWID!);
  };

  getMessageInfoForEmbeddingDb = async (ids: number[]) => {
    const query = this.baseAllMessageQuery()
      .innerJoin("chat_message_join", "chat_message_join.message_id", "message.ROWID")
      .select(["message.ROWID as message_id", "date", "handle_id", "chat_id", "text"])
      .where("message_id", "in", ids);
    return await query.execute();
  };
  getAllMessageTexts = async (limit?: number, offset?: number) => {
    let query = this.baseAllMessageQuery().select("text").distinct();
    if (limit) {
      query = query.limit(limit);
    }
    if (offset) {
      query = query.offset(offset);
    }
    return (await query.execute()).map((r) => r.text!);
  };
  countAllMessageTexts = async (distinctText = true): Promise<number> => {
    const query = this.baseAllMessageQuery().select((e) => {
      if (distinctText) {
        return e.fn.count("text").distinct().as("count");
      }
      return e.fn.count("ROWID").as("count");
    });
    const results = await query.executeTakeFirst();
    if (!results) {
      return 0;
    }
    return Number(results.count);
  };

  calculateSemanticSearchStats = async () => {
    const allText = await this.getAllMessageTexts();
    return getStatsForText(allText);
  };
  getMessagesForChatId = async (chatId: number | number[]) => {
    const messages = await this.getJoinedMessageQuery()
      .where("chat_message_join.chat_id", "in", [chatId].flat())
      .execute();
    const enhanced = await this.enhanceMessageResponses(messages);
    enhanced.sort((a, b) => {
      return (a.date || 0) - (b.date || 0);
    });
    return enhanced;
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
      query = query.where("date", ">", startOffset).where("date", "<", endOffset);
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
    const sent = await queryByOriginator(true);
    const received = await queryByOriginator(false);
    return { sent, received };
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

    const sent = await queryByOriginator(true).execute();
    const received = await queryByOriginator(false).execute();
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

    const sent = await queryByOriginator(true);
    const received = await queryByOriginator(false);
    return { sent, received };
  };

  private countMessagesByWeekday = async (year: number, chatIds?: number[]) => {
    const getByOriginator = (fromMe: boolean) => {
      return this.getMessageQueryByYear(year, chatIds)
        .select((e) => e.fn.count("message.ROWID").as("message_count"))
        .select(
          sql<string>`case cast(strftime('%w', DATE(date / 1000000000 + 978307200, 'unixepoch', 'localtime')) as integer)
           when 0 then 'Sunday'
           when 1 then 'Monday'
           when 2 then 'Tuesday'
           when 3 then 'Wednesday'
           when 4 then 'Thursday'
           when 5 then 'Friday'
           else 'Saturday' end`.as("weekday"),
        )
        .where("is_from_me", "=", Number(fromMe))
        .groupBy("weekday")
        .orderBy("message_count", "desc");
    };

    const received = await getByOriginator(false).execute();
    const sent = await getByOriginator(true).execute();
    return { received, sent };
  };

  private countMessagesByMonth = async (year: number, chatIds?: number[]) => {
    const getByOriginator = (fromMe: boolean) => {
      return this.getMessageQueryByYear(year, chatIds)
        .select((e) => e.fn.count("message.ROWID").as("message_count"))
        .select(
          sql<string>`case cast(strftime('%m', DATE(date / 1000000000 + 978307200, 'unixepoch', 'localtime')) as integer)
           when 1 then 'January'
           when 2 then 'February'
           when 3 then 'March'
           when 4 then 'April'
           when 5 then 'May'
           when 6 then 'June'
           when 7 then 'July'
           when 8 then 'August'
           when 9 then 'September'
           when 10 then 'October'
           when 11 then 'November'
           else 'December' end`.as("month"),
        )
        .where("is_from_me", "=", Number(fromMe))
        .groupBy("month")
        .orderBy("message_count", "desc");
    };

    const received = await getByOriginator(false).execute();
    const sent = await getByOriginator(true).execute();
    return { received, sent };
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
        .where(({ or, cmpr }) => or([cmpr("hour", ">", 22), cmpr("hour", "<", 5)]))
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

    const received = await getByOriginator(false);
    const sent = await getByOriginator(true);
    return { received, sent };
  };

  private getMostPopularOpeners = async (year: number, chatIds?: number[]) => {
    const getByOriginator = async (fromMe: boolean) => {
      const query = this.getMessageQueryByYear(year, chatIds)
        .select(["text", "attributedBody"])
        .where((eb) => {
          return eb.cmpr(
            "cmj.message_date",
            "=",
            eb
              .selectFrom("chat_message_join as cmj2")
              .select((e) => e.fn.min("cmj2.message_date").as("min_date"))
              .where("cmj2.chat_id", "=", eb.ref("c.ROWID")),
          );
        })
        .where("message.is_from_me", "=", Number(fromMe))
        .orderBy("message.date", "asc");

      const chats = await query.execute();
      for (const chat of chats) {
        if (!chat.text && chat.attributedBody) {
          chat.text = await getTextFromBuffer(chat.attributedBody);
        }
      }
      const openers: string[] = chats
        .map((chat) => {
          return (chat.text || "")
            .trim()
            .toLowerCase()
            .replace(/[\u{FFFC}-\u{FFFD}]/gu, "");
        })
        .filter(Boolean) as string[];
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
    const received = await getByOriginator(false);
    const sent = await getByOriginator(true);
    return { received, sent };
  };

  calculateWrappedStats = async (year: number, chatIds?: number[]) => {
    const [
      messageCount,
      chatInteractions,
      handleInteractions,
      weekdayInteractions,
      monthlyInteractions,
      lateNightInteractions,
      mostPopularOpeners,
    ] = await Promise.all([
      this.countMessagesByYear(year, chatIds),
      this.countMessagesByChat(year, chatIds),
      this.countMessagesByHandle(year, chatIds),
      this.countMessagesByWeekday(year, chatIds),
      this.countMessagesByMonth(year, chatIds),
      this.lateNightMessenger(year, chatIds),
      this.getMostPopularOpeners(year, chatIds),
    ]);
    return {
      messageCount,
      chatInteractions,
      handleInteractions,
      weekdayInteractions,
      monthlyInteractions,
      lateNightInteractions,
      mostPopularOpeners,
    };
  };

  calculateSlowWrappedStats = async (year: number, chatIds?: number[]) => {
    const allText = await this.getMessageQueryByYear(year, chatIds)
      .select("text")
      .distinct()
      .where("text", "not like", "")
      .where("text", "is not", null)
      .where("item_type", "not in", [1, 3, 4, 5, 6])
      .where("associated_message_type", "=", 0)
      .execute();

    const counts: Record<string, number> = {};
    for (const text of allText) {
      // clean text, replace all forms of quotes with nothing
      const s = text.text!.toLowerCase().replace(/[\u{2018}-\u{201F}]/gu, "");
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

  getMessageDates = async (year: number, chatIds?: number[]) => {
    const query = this.getMessageQueryByYear(year, chatIds).select(["date", "message.handle_id"]);
    const data = await query.execute();
    for (const message of data) {
      // maybe this is slow and its better not to pay serialization cost? idk
      this.addDateToMessage(message);
    }
    type AddedDates = Array<
      (typeof data)[number] & {
        date_obj?: Date;
        date_obj_delivered?: Date;
        date_obj_read?: Date;
      }
    >;

    return data as AddedDates;
  };
}

const addParsedTextToNullMessages = async (db: Kysely<MesssagesDatabase>) => {
  const messagesWithNullText = await db
    .selectFrom("message")
    .select(["ROWID", "attributedBody"])
    .where("text", "is", null)
    .where("attributedBody", "is not", null)
    .execute();

  if (messagesWithNullText.length) {
    const now = performance.now();
    logger.info(`Adding parsed text to ${messagesWithNullText.length} messages`);

    await db.transaction().execute(async (trx) => {
      for (const message of messagesWithNullText) {
        try {
          const { attributedBody, ROWID } = message;
          if (attributedBody) {
            const parsed = await decodeMessageBuffer(attributedBody);
            if (parsed) {
              const string = parsed[0]?.value?.string;
              if (typeof string === "string") {
                await trx.updateTable("message").set({ text: string }).where("ROWID", "=", ROWID).executeTakeFirst();
              }
            }
          }
        } catch {
          //skip
        }
      }
    });
    logger.info(`Done adding parsed text to ${messagesWithNullText.length} messages in ${performance.now() - now}ms`);
  }
};

const db = new SQLDatabase("Messages DB", appMessagesDbCopy, async (sqliteDb, kdb) => {
  // add in text
  logger.info("Adding text column to messages");
  await addParsedTextToNullMessages(kdb);
  logger.info("Adding text column to messages done");

  // create virtual table if not exists
  logger.info("Creating virtual table");
  await sqliteDb.exec("CREATE VIRTUAL TABLE IF NOT EXISTS message_fts USING fts5(text,message_id)");
  const count = await kdb.selectFrom("message_fts").select("message_id").limit(1).executeTakeFirst();
  if (count === undefined) {
    await sqliteDb.exec("INSERT INTO message_fts SELECT text, guid as message_id FROM message");
  }
  logger.info("Creating virtual table done");
});

// monkey patch to handle ipc calls

export default db;
