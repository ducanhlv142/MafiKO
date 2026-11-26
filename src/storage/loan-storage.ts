import type { Account } from "../domain/finance/account";
import type { Loan } from "../domain/finance/debt";

import { isValidLoan } from "../domain/finance/debt.js";

export function saveLoan(
    db: IDBDatabase,
    loan: Loan,
    maxDate: string
): Promise<void> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(
            ["accounts", "loans"],
            "readwrite"
        );

        const accounts = tx.objectStore("accounts");
        const loans = tx.objectStore("loans");

        const request = accounts.get(loan.accountId);

        let reason = "Không lưu được khoản vay.";

        tx.oncomplete = () => resolve();

        tx.onabort = () => {
            reject(tx.error ?? new Error(reason));
        };

        request.onsuccess = () => {
            try {
                const account: Account | undefined =
                    request.result;

                if (!isValidLoan(loan)) {
                    throw new Error("Khoản vay không hợp lệ.");
                }

                if (!account) {
                    throw new Error("Tài khoản không tồn tại.");
                }

                if (account.currency !== loan.currency) {
                    throw new Error("Tiền tệ không khớp.");
                }

                if (
                    loan.startDate < account.openingBalanceDate ||
                    loan.startDate > maxDate
                ) {
                    throw new Error("Ngày vay không hợp lệ.");
                }

                loans.add(loan);

            } catch (error) {
                reason = error instanceof Error
                    ? error.message
                    : "Lưu khoản vay thất bại.";

                tx.abort();
            }
        };
    });
}