import type { Account } from "../domain/finance/account";
import type { Transaction } from "../domain/finance/transaction";
import type { Transfer } from "../domain/finance/transfer";
import type { FinanceBackup } from "./backup";
import type { ImportRow } from "./import-csv";

import { prepareCsvImport } from "./import-csv.js";
import { detectDuplicates } from "./detect-duplicates.js";

function fingerprint(rows: ImportRow[]): string {
    return JSON.stringify(
        rows,
        (key, value) => key === "id" ? undefined : value
    );
}

export function commitCsvImport(
    db: IDBDatabase,
    content: string,
    expectedRows: ImportRow[],
): Promise<number> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(
            ["accounts", "transactions", "transfers", "budgets"],
            "readwrite"
        );

        const accounts = tx.objectStore("accounts");
        const transactions = tx.objectStore("transactions");
        const transfers = tx.objectStore("transfers");

        let imported = 0;
        let failure: unknown;

        tx.oncomplete = () => resolve(imported);

        tx.onabort = () => {
            reject(
                failure ??
                tx.error ??
                new Error("Quá trình nhập CSV đã bị hủy.")
            );
        };

        const accountRequest = accounts.getAll();
        const transactionRequest = transactions.getAll();
        const budgetRequest =
            tx.objectStore("budgets").getAll();
        const transferRequest = transfers.getAll();

        transferRequest.onsuccess = () => {
            try {
                const backup: FinanceBackup = {
                    app: "MafiKO",
                    formatVersion: 2,
                    budgets: budgetRequest.result,
                    exportedAt: new Date().toISOString(),
                    accounts: accountRequest.result as Account[],
                    transactions: transactionRequest.result as Transaction[],
                    transfers: transferRequest.result as Transfer[],
                };

                const result = prepareCsvImport(
                    content,
                    backup.accounts
                );

                if (result.errors.length > 0) {
                    throw new Error("CSV có dữ liệu không hợp lệ.");
                }

                const duplicates = detectDuplicates(
                    result.rows,
                    backup
                );

                const newRows = result.rows.filter(
                    row => !duplicates.has(row.rowNumber)
                );

                if (
                    fingerprint(newRows) !== fingerprint(expectedRows)
                ) {
                    throw new Error(
                        "Dữ liệu sổ đã thay đổi. Hãy chọn lại file CSV."
                    );
                }

                for (const row of newRows) {
                    if (row.type === "transaction") {
                        transactions.add(row.data);
                    } else {
                        transfers.add(row.data);
                    }

                    imported++;
                }

            } catch (error) {
                failure = error;
                tx.abort();
            }
        };
    });
}