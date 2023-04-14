import SqliteDb from "better-sqlite3";
import type { SelectQueryBuilder } from "kysely";
import { Kysely, sql, SqliteDialect } from "kysely";
import type { DB as MesssagesDatabase } from "../../_generated/types";
import logger from "../utils/logger";
import type { KyselyConfig } from "kysely/dist/cjs/kysely";
import { countBy, groupBy, partition } from "lodash-es";
import type { Contact } from "electron-mac-contacts";
import { format } from "sql-formatter";
import { decodeMessageBuffer, getTextFromBuffer } from "../utils/buffer";
import { localDbExists } from "./db-file-utils";
import { appMessagesDbCopy } from "../utils/constants";
import { getStatsForText } from "./semantic-search-stats";
import { removeStopWords } from "./text";

type ExtractO<T> = T extends SelectQueryBuilder<any, any, infer O> ? O : never;
type JoinedMessageType = ExtractO<ReturnType<SQLDatabase["getJoinedMessageQuery"]>>;
const debugLoggingEnabled = process.env.DEBUG_LOGGING === "true";

export class SQLDatabase {
  path: string = appMessagesDbCopy;
  private dbWriter: Kysely<MesssagesDatabase> | undefined;

  initializationPromise!: Promise<void>;

  initialize = () => {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }
    this.initializationPromise = new Promise(async (resolve) => {
      const success = await this.trySetupDb();
      if (!success) {
        const startTimeout = () =>
          setTimeout(async () => {
            const success = await this.trySetupDb();
            if (success) {
              resolve();
            } else {
              startTimeout();
            }
          }, 1000);
        startTimeout();
      } else {
        resolve();
      }
    });
    this.initializationPromise.then(() => {
      logger.info("DB initialized");
    });

    return this.initializationPromise;
  };

  addParsedTextToNullMessages = async () => {
    const db = this.db;
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
  get db() {
    if (!this.dbWriter) {
      throw new Error("DB not initialized!");
    }
    return this.dbWriter;
  }

  reloadDb = async () => {
    if (this.dbWriter) {
      await this.dbWriter.destroy();
    }
    this.dbWriter = undefined;
    await this.trySetupDb();
  };
  trySetupDb = async () => {
    try {
      if (!(await localDbExists())) {
        return false;
      }
      const sqliteDb = new SqliteDb(this.path);
      const dialect = new SqliteDialect({ database: sqliteDb });
      const options: KyselyConfig = {
        dialect,
        log(event): void {
          const isError = event.level === "error";

          if (isError || debugLoggingEnabled) {
            const { sql, parameters } = event.query;

            const { queryDurationMillis } = event;
            const duration = queryDurationMillis.toFixed(2);
            const params = (parameters as string[]) || [];
            const formattedSql = format(sql, { params: params.map((l) => String(l)), language: "sqlite" });
            if (event.level === "query") {
              logger.debug(`[Query - ${duration}ms]:\n${formattedSql}\n`);
            }

            if (isError) {
              logger.error(`[SQL Error - ${duration}ms]: ${event.error}\n\n${formattedSql}\n`);
            }
          }
        },
      };

      const db = new Kysely<MesssagesDatabase>(options);
      this.dbWriter = db;
      // add in text
      await this.addParsedTextToNullMessages();

      // create virtual table if not exists
      await sqliteDb.exec("CREATE VIRTUAL TABLE IF NOT EXISTS message_fts USING fts5(text,message_id)");
      const count = await db.selectFrom("message_fts").select("message_id").limit(1).executeTakeFirst();
      if (count === undefined) {
        await sqliteDb.exec("INSERT INTO message_fts SELECT text, guid as message_id FROM message");
      }
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };
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
    type Handles = Array<typeof handles[number] & { contact?: Contact | null }>;
    type EnhancedChat = typeof chats[number] & { handles: Handles; name: string; sameParticipantChatIds: number[] };
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

  fullTextMessageSearch = async (
    searchTerm: string,
    chatIds?: number[],
    handleIds?: number[],
    startDate?: Date | null,
    endDate?: Date | null,
  ) => {
    const db = this.db;
    // SELECT * FROM message_fts WHERE text MATCH 'jonluca' ORDER BY rank;
    const textMatch = await db
      .selectFrom("message_fts")
      .select(["message_id"])
      .where("text", sql`match`, searchTerm)
      .orderBy(sql`rank`, "asc")
      .execute();
    const messageGuids = textMatch.map((m) => m.message_id as string);
    const messageGuidsSet = new Set(messageGuids);

    let query = this.getJoinedMessageQuery()
      .select("message.guid as guid")
      .where(({ or, cmpr }) => {
        return or([
          cmpr("message.guid", "in", messageGuids),
          cmpr("filename", "like", "%" + searchTerm + "%"),
          cmpr("text", "like", "%" + searchTerm + "%"),
        ]);
      })
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

    const messages = await query.limit(10000).execute();
    const [matchedMessages, unmatchedMessages] = partition(messages, (m) => messageGuidsSet.has(m.guid));
    matchedMessages.sort((a, b) => {
      return messageGuids.indexOf(a.guid) - messageGuids.indexOf(b.guid);
    });
    unmatchedMessages.sort((a, b) => {
      return (b.date || 0) - (a.date || 0);
    });
    const allMessages = [...matchedMessages, ...unmatchedMessages];
    return this.enhanceMessageResponses<typeof messages[number]>(allMessages);
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
    });

    return flat as EnhancedMessage[];
  };

  getAllMessageTexts = async () => {
    return await this.db
      .selectFrom("message")
      .select(["text", "guid"])
      .distinct()
      .where("text", "not like", "")
      .where("text", "is not", null)
      .execute();
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
      }) as Array<Omit<typeof data[number], "hour">>;
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
      typeof data[number] & {
        date_obj?: Date;
        date_obj_delivered?: Date;
        date_obj_read?: Date;
      }
    >;

    return data as AddedDates;
  };
}

const db = new SQLDatabase();

// monkey patch to handle ipc calls

export default db;
