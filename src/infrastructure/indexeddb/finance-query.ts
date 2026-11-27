import type {
    FinanceSnapshot,
    DebtSnapshot,
} from "../../application/queries/finance-snapshot";

export const FINANCE_STORES = [
    "accounts",
    "transactions",
    "transfers",
    "budgets",
    "loans",
    "loanPayments",
    "savingsPlans",
    "savingsMovements",
] as const;

export function readFinanceSnapshot(
    db: IDBDatabase
): Promise<FinanceSnapshot> {

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

        const savingsPlans =
            tx.objectStore("savingsPlans").getAll();

        const savingsMovements =
            tx.objectStore("savingsMovements").getAll();

        tx.oncomplete = () => {

            resolve({
                accounts: accounts.result,
                transactions: transactions.result,
                transfers: transfers.result,
                budgets: budgets.result,

                loans: loans.result,
                loanPayments: loanPayments.result,

                savingsPlans: savingsPlans.result,
                savingsMovements: savingsMovements.result,
            });
        };

        tx.onabort = () => {

            reject(
                tx.error ??
                new Error(
                    "Không đọc được dữ liệu tài chính."
                )
            );
        };
    });
}

export function readDebtSnapshot(
    db: IDBDatabase
): Promise<DebtSnapshot> {

    return new Promise((resolve, reject) => {

        const tx = db.transaction(
            [
                "accounts",
                "loans",
                "loanPayments",
            ],
            "readonly"
        );

        const accounts =
            tx.objectStore("accounts").getAll();

        const loans =
            tx.objectStore("loans").getAll();

        const loanPayments =
            tx.objectStore("loanPayments").getAll();

        tx.oncomplete = () => {

            resolve({
                accounts: accounts.result,
                loans: loans.result,
                loanPayments: loanPayments.result,
            });
        };

        tx.onabort = () => {

            reject(
                tx.error ??
                new Error(
                    "Không đọc được dữ liệu khoản vay."
                )
            );
        };
    });
}