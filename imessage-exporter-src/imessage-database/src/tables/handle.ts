import { Database, Statement, RunResult } from "sqlite3";
import { ME } from "../util/constants";
import {
  Table,
  Cacheable,
  Deduplicate,
  Diagnostic,
  TableError,
} from "./table";

export class Handle implements Table, Cacheable, Deduplicate, Diagnostic {
  public rowid: number;
  public id: string;
  public personCentricId?: string;

  static fromRow(row: any): Handle {
    return new Handle(row.rowid, row.id, row.person_centric_id);
  }

  constructor(rowid: number, id: string, personCentricId?: string) {
    this.rowid = rowid;
    this.id = id;
    this.personCentricId = personCentricId;
  }

  get(db: Database): Promise<Statement> {
    return new Promise((resolve, reject) => {
      db.prepare("SELECT * from handle", (err: Error, stmt: Statement) => {
        if (err) {
          reject(TableError.Handle(err));
        } else {
          resolve(stmt);
        }
      });
    });
  }

  extract(handle: Promise<Handle | TableError>): Promise<Handle> {
    return new Promise((resolve, reject) => {
      handle
        .then((hdl) => {
          resolve(hdl as Handle);
        })
        .catch((why) => {
          reject(TableError.Handle(why));
        });
    });
  }

  cache(db: Database): Promise<Map<number, string>> {
    return new Promise((resolve, reject) => {
      const map = new Map<number, string>();
      map.set(0, ME);
      this.get(db).then((statement) => {
        statement.all((handleErr: Error, rows: any[]) => {
          if (handleErr) {
            reject(TableError.Handle(handleErr));
          } else {
            rows.forEach((row) => {
              const contact = Handle.fromRow(row);
              map.set(contact.rowid, contact.id);
            });
            for (const [id, newId] of getPersonIdMap(db)) {
              map.set(id, newId);
            }
            resolve(map);
          }
        });
      });
    });
  }

  dedupe(duplicatedData: Map<number, string>): Map<number, number> {
    const deduplicatedParticipants = new Map<number, number>();
    const participantToUniqueParticipantId = new Map<string, number>();

    let uniqueParticipantIdentifier = 0;
    for (const [participantId, participant] of duplicatedData.entries()) {
      const id = participantToUniqueParticipantId.get(participant);
      if (id !== undefined) {
        deduplicatedParticipants.set(participantId, id);
      } else {
        participantToUniqueParticipantId.set(
          participant,
          uniqueParticipantIdentifier
        );
        deduplicatedParticipants.set(
          participantId,
          uniqueParticipantIdentifier
        );
        uniqueParticipantIdentifier += 1;
      }
    }
    return deduplicatedParticipants;
  }

  runDiagnostic(db: Database) {
    // TODO: Implement processing and doneProcessing helpers, if required
    // processing();
    db.get(
      "SELECT COUNT(DISTINCT person_centric_id) FROM handle WHERE person_centric_id NOT NULL",
      (err: Error, row) => {
        if (err === null) {
          // doneProcessing();
          const dupes = row[Object.keys(row)[0]];
          if (dupes > 0) {
            console.log("Contacts with more than one ID:", dupes);
          }
        }
      }
    );
  }

  private static getPersonIdMap(db: Database): Map<number, string> {
    const personToId = new Map<string, Set<string>>();
    const rowToId = new Map<number, string>();
    const rowData: Array<[string, number, string]> = [];

    const query =
      "SELECT DISTINCT A.person_centric_id, A.rowid, A.id FROM handle A INNER JOIN handle B ON B.id = A.id WHERE A.person_centric_id NOT NULL ORDER BY A.person_centric_id";
    db.all(query, (err: Error, rows: any[]) => {
      if (err === null) {
        rows.forEach((row) => {
          rowData.push([row.person_centric_id, row.rowid, row.id]);
        });

        rowData.forEach(([personCentricId, _, id]) => {
          const set = personToId.get(personCentricId);
          if (set !== undefined) {
            set.add(id);
          } else {
            const newSet = new Set<string>();
            newSet.add(id);
            personToId.set(personCentricId, newSet);
          }
        });

        rowData.forEach(([personCentricId, rowid, _]) => {
          const dataToInsert = Array.from(
            personToId.get(personCentricId) as Set<string>
          ).join(" ");
          rowToId.set(rowid, dataToInsert);
        });
      }
    });

    return rowToId;
  }
}