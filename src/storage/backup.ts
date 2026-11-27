import type {
    FinanceSnapshot,
} from "../application/queries/finance-snapshot";

import {
    readFinanceSnapshot,
} from "../infrastructure/indexeddb/finance-query.js";

export {
    FINANCE_STORES,
} from "../infrastructure/indexeddb/finance-query.js";

export interface FinanceBackup
    extends FinanceSnapshot {

    app: "MafiKO";

    formatVersion: 4;

    exportedAt: string;
}

export async function createBackup(
    db: IDBDatabase
): Promise<FinanceBackup> {

    const snapshot =
        await readFinanceSnapshot(db);

    return {
        app: "MafiKO",
        formatVersion: 4,
        exportedAt: new Date().toISOString(),

        ...snapshot,
    };
}