import type { Account } from "./account";
import type { Transaction } from "./transaction";
import type { LedgerEvent } from "./ledger-posting";
import type {
    Loan,
    LoanPayment,
} from "./debt";

import type {
    SavingsPlan,
    SavingsMovement,
} from "./savings";

import type {
    FinancialLedger,
} from "./ledger-projection";

import {
    projectLedger,
    getPositionMovements,
} from "./ledger-projection.js";

import {
    calculateBalance,
} from "./balance.js";

import { summarizeLoan } from "./debt.js";

import { savingsNetValue } from "./savings.js";

import { DomainError } from "./errors.js";

export type {
    FinancialLedger,
} from "./ledger-projection";

// ========================================
// ACCOUNT BALANCE
// ========================================

export function getAccountBalance(
    account: Account,
    ledger: FinancialLedger
): number {

    const events = projectLedger(ledger);

    const movements = getPositionMovements(
        events,
        "account",
        account.id
    );

    const isCard =
        account.kind === "credit_card";

    return calculateBalance(
        account.openingBalanceMinor,

        isCard
            ? movements.map(value => -value)
            : movements
    );
}

// ========================================
// INCOME & EXPENSE REPORT
// ========================================

export function getReportTransactions(
    ledger: FinancialLedger
): Transaction[] {

    return getReportTransactionsFromEvents(
        projectLedger(ledger)
    );
}

export function getReportTransactionsFromEvents(
    events: readonly LedgerEvent[]
): Transaction[] {

    const result: Transaction[] = [];

    for (const event of events) {

        if (!event.report) continue;

        const reportPosting =
            event.postings.find(
                item =>
                    item.positionKind === "income" ||
                    item.positionKind === "expense"
            );

        if (!reportPosting) {

            throw new DomainError(
                "UNBALANCED_LEDGER_EVENT"
            );
        }

        const kind =
            reportPosting.positionKind === "income"
                ? "income"
                : "expense";

        result.push({
            id: event.report.id,

            accountId:
                event.report.accountId,

            kind,

            amountMinor:
                Math.abs(
                    reportPosting.amountMinor
                ),

            categoryId:
                event.report.categoryId,

            date: event.date,
            note: event.note,
        });
    }

    return result;
}

// ========================================
// DEBT NET VALUE
// ========================================

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

// ========================================
// SAVINGS NET VALUE
// ========================================

export function getSavingsNetValue(
    plan: SavingsPlan,
    movements: readonly SavingsMovement[]
): number {

    return savingsNetValue(
        plan,
        movements
    );
}