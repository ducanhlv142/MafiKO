import type { Account } from "../domain/finance/account";
import type { Transaction } from "../domain/finance/transaction";
import type { Transfer } from "../domain/finance/transfer";

export interface FinanceBackup {
    app: "MafiKO";
    formatVersion: 1;
    exportedAt: string;
    accounts: Account[];
    transactions: Transaction[];
    transfers: Transfer[];
}

export function createBackup(db: IDBDatabase): Promise<FinanceBackup> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(
            ["accounts", "transactions", "transfers"],
            "readonly",
        );

        const accounts = tx.objectStore("accounts").getAll();
        const transactions = tx.objectStore("transactions").getAll();
        const transfers = tx.objectStore("transfers").getAll();

        tx.oncomplete = () => {
            resolve({
                app: "MafiKO",
                formatVersion: 1,
                exportedAt: new Date().toISOString(),
                accounts: accounts.result,
                transactions: transactions.result,
                transfers: transfers.result,
            });
        };

        tx.onabort = () => {
            reject(tx.error ?? new Error("Không đọc được dữ liệu để sao lưu."));
        };
    });
}