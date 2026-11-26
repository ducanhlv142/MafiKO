import type { Account } from "../domain/finance/account";
import type { Transaction } from "../domain/finance/transaction";
import type { Transfer } from "../domain/finance/transfer";
import type { Budget } from "../domain/finance/budget";
import type {
    Loan,
    LoanPayment,
} from "../domain/finance/debt";

export const FINANCE_STORES = [
    "accounts",
    "transactions",
    "transfers",
    "budgets",
    "loans",
    "loanPayments",
] as const;

export interface FinanceBackup {
    app: "MafiKO";
    formatVersion: 3;
    exportedAt: string;

    accounts: Account[];
    transactions: Transaction[];
    transfers: Transfer[];
    budgets: Budget[];
    loans: Loan[];
    loanPayments: LoanPayment[];
}

export function createBackup(
    db: IDBDatabase
): Promise<FinanceBackup> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(
            [...FINANCE_STORES],
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

        const loans =
            tx.objectStore("loans").getAll();

        const loanPayments =
            tx.objectStore("loanPayments").getAll();

        tx.oncomplete = () => {
            resolve({
                app: "MafiKO",
                formatVersion: 3,
                exportedAt: new Date().toISOString(),

                accounts: accounts.result,
                transactions: transactions.result,
                transfers: transfers.result,
                budgets: budgets.result,
                loans: loans.result,
                loanPayments: loanPayments.result,
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