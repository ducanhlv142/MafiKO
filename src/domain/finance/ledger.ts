import type { Account } from "./account";
import type { Transaction } from "./transaction";
import type { Transfer } from "./transfer";

import type {
    Loan,
    LoanPayment,
} from "./debt";

import { calculateBalance } from "./balance.js";
import { toMovement } from "./transaction.js";
import { transferMovement } from "./transfer.js";

import {
    loanCashMovement,
    paymentCashMovement,
    summarizeLoan,
} from "./debt.js";
import type {
    SavingsPlan,
    SavingsMovement,
} from "./savings";

import {
    savingsCashMovement,
    savingsMovementCash,
    savingsNetValue,
} from "./savings.js";

export interface FinancialLedger {
    transactions: readonly Transaction[];
    transfers: readonly Transfer[];

    loans: readonly Loan[];
    loanPayments: readonly LoanPayment[];

    savingsPlans: readonly SavingsPlan[];
    savingsMovements: readonly SavingsMovement[];
}

export function getAccountBalance(
    account: Account,
    ledger: FinancialLedger,
): number {
    const changes: number[] = [];

    for (const transaction of ledger.transactions) {
        if (transaction.accountId === account.id) {
            changes.push(toMovement(transaction));
        }
    }

    for (const transfer of ledger.transfers) {
        changes.push(
            transferMovement(transfer, account.id)
        );
    }

    const loans = new Map(
        ledger.loans.map(loan => [loan.id, loan])
    );

    for (const loan of ledger.loans) {
        changes.push(
            loanCashMovement(loan, account.id)
        );
    }

    for (const payment of ledger.loanPayments) {
        const loan = loans.get(payment.loanId);

        if (!loan) {
            throw new Error(
                "Khoản thanh toán không có khoản vay."
            );
        }

        changes.push(
            paymentCashMovement(
                loan,
                payment,
                account.id
            )
        );
    }

    const savingsMap = new Map(
        ledger.savingsPlans.map(
            plan => [plan.id, plan]
        )
    );

    for (const plan of ledger.savingsPlans) {
        changes.push(
            savingsCashMovement(
                plan,
                account.id
            )
        );
    }

    for (const movement of ledger.savingsMovements) {

        const plan = savingsMap.get(
            movement.savingsId
        );

        if (!plan) {
            throw new Error(
                "Biến động không có sổ tiết kiệm."
            );
        }

        changes.push(
            savingsMovementCash(
                plan,
                movement,
                account.id
            )
        );
    }

    const isCard = account.kind === "credit_card";

    return calculateBalance(
        account.openingBalanceMinor,
        isCard
            ? changes.map(value => -value)
            : changes
    );
}

export function getReportTransactions(
    ledger: FinancialLedger
): Transaction[] {
    const result = [...ledger.transactions];

    const loans = new Map(
        ledger.loans.map(loan => [loan.id, loan])
    );

    for (const payment of ledger.loanPayments) {
        const loan = loans.get(payment.loanId);

        if (!loan) {
            throw new Error(
                "Không tìm thấy khoản vay."
            );
        }

        const amount =
            payment.interestMinor + payment.feeMinor;

        if (!Number.isSafeInteger(amount) || amount < 0) {
            throw new Error("Lãi và phí không hợp lệ.");
        }

        if (amount === 0) continue;

        const borrowed = loan.direction === "borrowed";

        result.push({
            id: `loan-report:${payment.id}`,
            accountId: payment.accountId,
            kind: borrowed ? "expense" : "income",
            categoryId: borrowed
                ? "loanCost"
                : "loanIncome",

            amountMinor: amount,
            date: payment.date,

            note: `Lãi và phí · ${loan.counterparty}`,
        });
    }

    const savingsMap = new Map(
        ledger.savingsPlans.map(
            plan => [plan.id, plan]
        )
    );

    for (const movement of ledger.savingsMovements) {

        const plan = savingsMap.get(
            movement.savingsId
        );

        if (!plan) {
            throw new Error(
                "Không tìm thấy sổ tiết kiệm."
            );
        }

        if (
            movement.kind !== "interestCash" &&
            movement.kind !== "interestCapitalized"
        ) {
            continue;
        }

        result.push({
            id: `savings-report:${movement.id}`,

            accountId: movement.accountId,

            kind: "income",

            categoryId: "savingsInterest",

            amountMinor: movement.amountMinor,

            date: movement.date,

            note:
                movement.kind === "interestCash"
                    ? `Lãi tiết kiệm · ${plan.name}`
                    : `Lãi nhập gốc · ${plan.name}`,
        });
    }

    return result;
}

export function getLoanNetValue(
    loan: Loan,
    payments: readonly LoanPayment[]
): number {
    const summary = summarizeLoan(
        loan,
        payments
    );

    return loan.direction === "borrowed"
        ? -summary.remainingPrincipalMinor
        : summary.remainingPrincipalMinor;
}

export function getSavingsNetValue(
    plan: SavingsPlan,
    movements: readonly SavingsMovement[]
): number {

    return savingsNetValue(
        plan,
        movements
    );
}