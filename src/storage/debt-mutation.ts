import type { Account } from "../domain/finance/account";

import type {
    Loan,
    LoanPayment,
} from "../domain/finance/debt";

import {
    isValidLoan,
    isValidLoanPayment,
    summarizeLoan,
} from "../domain/finance/debt.js";
import type {
    DebtChange,
} from "../application/commands/finance-mutation";

export type {
    DebtChange,
} from "../application/commands/finance-mutation";

export function mutateDebt(
    db: IDBDatabase,
    expectedLoan: Loan,
    change: DebtChange,
    maxDate: string
): Promise<void> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(
            ["accounts", "loans", "loanPayments"],
            "readwrite"
        );

        const accounts = tx.objectStore("accounts");
        const loans = tx.objectStore("loans");
        const payments = tx.objectStore("loanPayments");

        let failure: unknown;

        tx.oncomplete = () => resolve();

        tx.onabort = () => {
            reject(
                failure ??
                tx.error ??
                new Error("Thao tác khoản vay thất bại.")
            );
        };

        const accountRequest = accounts.getAll();

        const loanRequest = loans.get(expectedLoan.id);

        const paymentRequest = payments
            .index("byLoan")
            .getAll(expectedLoan.id);

        paymentRequest.onsuccess = () => {
            try {
                const loan: Loan | undefined =
                    loanRequest.result;

                const history: LoanPayment[] =
                    paymentRequest.result;

                const accountMap = new Map(
                    (accountRequest.result as Account[])
                        .map(a => [a.id, a])
                );

                if (
                    !loan ||
                    JSON.stringify(loan) !==
                    JSON.stringify(expectedLoan)
                ) {
                    throw new Error(
                        "Khoản vay đã thay đổi. Hãy tải lại trang."
                    );
                }

                switch (change.kind) {

                    case "updateLoan": {
                        const next = change.next;

                        if (!isValidLoan(next)) {
                            throw new Error(
                                "Khoản vay không hợp lệ."
                            );
                        }

                        if (
                            next.id !== loan.id ||
                            next.direction !== loan.direction ||
                            next.accountId !== loan.accountId ||
                            next.currency !== loan.currency ||
                            next.startDate !== loan.startDate
                        ) {
                            throw new Error(
                                "Không được thay đổi thông tin gốc của khoản vay."
                            );
                        }

                        const account = accountMap.get(
                            next.accountId
                        );

                        if (
                            !account ||
                            account.currency !== next.currency ||
                            next.startDate < account.openingBalanceDate ||
                            next.startDate > maxDate
                        ) {
                            throw new Error(
                                "Tài khoản hoặc ngày vay không hợp lệ."
                            );
                        }

                        summarizeLoan(next, history);

                        loans.put(next);

                        break;
                    }

                    case "deleteLoan": {
                        if (history.length > 0) {
                            throw new Error(
                                "Hãy xử lý lịch sử thanh toán trước khi xóa khoản vay."
                            );
                        }

                        loans.delete(loan.id);

                        break;
                    }

                    case "updatePayment":
                    case "deletePayment": {
                        const current = history.find(
                            p => p.id === change.expected.id
                        );

                        if (
                            !current ||
                            JSON.stringify(current) !==
                            JSON.stringify(change.expected)
                        ) {
                            throw new Error(
                                "Thanh toán đã thay đổi. Hãy tải lại trang."
                            );
                        }

                        const remaining = history.filter(
                            p => p.id !== current.id
                        );

                        if (change.kind === "deletePayment") {
                            summarizeLoan(loan, remaining);

                            payments.delete(current.id);

                            break;
                        }

                        const next = change.next;

                        if (
                            !isValidLoanPayment(next) ||
                            next.id !== current.id ||
                            next.loanId !== loan.id
                        ) {
                            throw new Error(
                                "Thanh toán không hợp lệ."
                            );
                        }

                        const account = accountMap.get(
                            next.accountId
                        );

                        if (
                            !account ||
                            account.currency !== loan.currency
                        ) {
                            throw new Error(
                                "Tài khoản thanh toán không hợp lệ."
                            );
                        }

                        if (
                            next.date < loan.startDate ||
                            next.date < account.openingBalanceDate ||
                            next.date > maxDate
                        ) {
                            throw new Error(
                                "Ngày thanh toán không hợp lệ."
                            );
                        }

                        summarizeLoan(
                            loan,
                            [...remaining, next]
                        );

                        payments.put(next);

                        break;
                    }
                }

            } catch (error) {
                failure = error;

                tx.abort();
            }
        };
    });
}