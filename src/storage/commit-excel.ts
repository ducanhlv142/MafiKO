import type { FinanceBackup } from "./backup";
import type { ExcelImportRow } from "./import-excel";
import {
    FINANCE_STORES,
    BACKUP_FORMAT_VERSION,
} from "./backup.js";
import { parseBackup } from "./restore.js";

export function commitExcelImport(
    db: IDBDatabase,
    expected: FinanceBackup,
    rows: ExcelImportRow[],
): Promise<number> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(
            [...FINANCE_STORES],
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
                new Error("Nhập Excel đã bị hủy.")
            );
        };

        const accountRequest = accounts.getAll();
        const transactionRequest = transactions.getAll();
        const budgetRequest =
            tx.objectStore("budgets").getAll();
        const loanRequest =
            tx.objectStore("loans").getAll();

        const loanPaymentRequest =
            tx.objectStore("loanPayments").getAll();
        const savingsPlanRequest =
            tx.objectStore("savingsPlans").getAll();

        const savingsMovementRequest =
            tx.objectStore("savingsMovements").getAll();
        const categoryRequest =
            tx.objectStore("categories").getAll();
        const transferRequest = transfers.getAll();

        transferRequest.onsuccess = () => {
            try {
                const current: FinanceBackup = {
                    app: "MafiKO",
                    formatVersion: BACKUP_FORMAT_VERSION,

                    categories: categoryRequest.result,
                    savingsPlans: savingsPlanRequest.result,
                    savingsMovements: savingsMovementRequest.result,
                    loans: loanRequest.result,
                    loanPayments: loanPaymentRequest.result,
                    budgets: budgetRequest.result,
                    exportedAt: new Date().toISOString(),
                    accounts: accountRequest.result,
                    transactions: transactionRequest.result,
                    transfers: transferRequest.result,
                };

                for (const key of FINANCE_STORES) {
                    if (
                        JSON.stringify(current[key]) !==
                        JSON.stringify(expected[key])
                    ) {
                        throw new Error(
                            "Dữ liệu sổ đã thay đổi. Hãy chọn lại file Excel."
                        );
                    }
                }

                const next: FinanceBackup = {
                    ...current,
                    transactions: [...current.transactions],
                    transfers: [...current.transfers],
                };

                for (const row of rows) {
                    if (row.type === "transaction") {
                        next.transactions.push(row.data);
                    } else {
                        next.transfers.push(row.data);
                    }
                }

                // Kiểm tra toàn bộ dữ liệu trước khi ghi.
                parseBackup(JSON.stringify(next));

                for (const row of rows) {
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