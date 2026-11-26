import type { Account } from "../domain/finance/account";
import type { Transaction } from "../domain/finance/transaction";
import type { Transfer } from "../domain/finance/transfer";
import type { Budget } from "../domain/finance/budget";

export interface FinanceBackup {
    app: "MafiKO";
    formatVersion: 2;
    exportedAt: string;

    accounts: Account[];
    transactions: Transaction[];
    transfers: Transfer[];
    budgets: Budget[];
}

export function createBackup(
    db: IDBDatabase
): Promise<FinanceBackup> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(
            [
                "accounts",
                "transactions",
                "transfers",
                "budgets",
            ],
            "readonly"
        );

        const accounts =
            tx.objectStore("accounts").getAll();

        const transactions =
            tx.objectStore("transactions").getAll();

        const transfers =
            tx.objectStore("transfers").getAll();

        const budgets =
            tx.objectStore("budgets").getAll();

        tx.oncomplete = () => {
            resolve({
                app: "MafiKO",
                formatVersion: 2,
                exportedAt: new Date().toISOString(),

                accounts: accounts.result,
                transactions: transactions.result,
                transfers: transfers.result,
                budgets: budgets.result,
            });
        };

        tx.onabort = () => {
            reject(
                tx.error ??
                new Error("Không đọc được dữ liệu để sao lưu.")
            );
        };
    });
}