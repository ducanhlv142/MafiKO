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

export function saveLoanPayment(
    db: IDBDatabase,
    payment: LoanPayment,
    expectedLoan: Loan,
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
                new Error("Không lưu được thanh toán.")
            );
        };

        const accountRequest =
            accounts.get(payment.accountId);

        const loanRequest =
            loans.get(payment.loanId);

        const paymentRequest = payments
            .index("byLoan")
            .getAll(payment.loanId);

        paymentRequest.onsuccess = () => {
            try {
                const account: Account | undefined =
                    accountRequest.result;

                const loan: Loan | undefined =
                    loanRequest.result;

                const existingPayments: LoanPayment[] =
                    paymentRequest.result;

                if (!isValidLoanPayment(payment)) {
                    throw new Error(
                        "Khoản thanh toán không hợp lệ."
                    );
                }

                if (!loan || !isValidLoan(loan)) {
                    throw new Error(
                        "Khoản vay không tồn tại hoặc không hợp lệ."
                    );
                }

                if (
                    JSON.stringify(loan) !==
                    JSON.stringify(expectedLoan)
                ) {
                    throw new Error(
                        "Khoản vay đã thay đổi. Hãy tải lại trang."
                    );
                }

                if (!account) {
                    throw new Error(
                        "Tài khoản không tồn tại."
                    );
                }

                if (account.currency !== loan.currency) {
                    throw new Error(
                        "Tiền tệ thanh toán không khớp."
                    );
                }

                if (
                    payment.date < loan.startDate ||
                    payment.date < account.openingBalanceDate ||
                    payment.date > maxDate
                ) {
                    throw new Error(
                        "Ngày thanh toán không hợp lệ."
                    );
                }

                const summary = summarizeLoan(
                    loan,
                    existingPayments
                );

                if (
                    payment.principalMinor >
                    summary.remainingPrincipalMinor
                ) {
                    throw new Error(
                        "Tiền gốc thanh toán vượt dư nợ."
                    );
                }

                summarizeLoan(
                    loan,
                    [...existingPayments, payment]
                );

                payments.add(payment);

            } catch (error) {
                failure = error;
                tx.abort();
            }
        };
    });
}