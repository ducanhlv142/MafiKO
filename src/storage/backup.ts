import type {
    FinanceSnapshot,
} from "../application/queries/finance-snapshot";

import {
    readFinanceSnapshot,
} from "../infrastructure/indexeddb/finance-query.js";

export {
    FINANCE_STORES,
} from "../infrastructure/indexeddb/finance-query.js";

export const BACKUP_FORMAT_VERSION = 5 as const;

export interface FinanceBackup
    extends FinanceSnapshot {

    app: "MafiKO";

    formatVersion: typeof BACKUP_FORMAT_VERSION;

    exportedAt: string;
}

export async function createBackup(
    db: IDBDatabase
): Promise<FinanceBackup> {

    const snapshot =
        await readFinanceSnapshot(db);

    return {

        app: "MafiKO",

        formatVersion: BACKUP_FORMAT_VERSION,

        exportedAt: new Date().toISOString(),

        ...snapshot,
    };
}