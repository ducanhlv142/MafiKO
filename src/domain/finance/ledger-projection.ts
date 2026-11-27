import type { Transaction } from "./transaction";
import type { Transfer } from "./transfer";

import type {
    Loan,
    LoanPayment,
} from "./debt";

import type {
    SavingsPlan,
    SavingsMovement,
} from "./savings";

import type {
    LedgerEvent,
    LedgerPosting,
    LedgerPositionKind,
} from "./ledger-posting";

import { toMovement } from "./transaction.js";

import {
    safeAddMinor,
    sumMinor,
} from "./money.js";

import {
    isValidTransfer,
} from "./transfer.js";

import {
    isValidLoan,
    isValidLoanPayment,
} from "./debt.js";

import {
    isValidSavingsPlan,
    isValidSavingsMovement,
} from "./savings.js";

import { DomainError } from "./errors.js";

export interface FinancialLedger {

    transactions: readonly Transaction[];
    transfers: readonly Transfer[];

    loans: readonly Loan[];
    loanPayments: readonly LoanPayment[];

    savingsPlans: readonly SavingsPlan[];
    savingsMovements: readonly SavingsMovement[];
}

function posting(
    positionKind: LedgerPositionKind,
    positionId: string,
    amountMinor: number
): LedgerPosting {

    return {
        positionKind,
        positionId,
        amountMinor,
    };
}

export function assertBalancedEvent(
    event: LedgerEvent
): void {

    if (
        event.postings.length < 2 ||
        sumMinor(
            event.postings.map(
                p => p.amountMinor
            )
        ) !== 0
    ) {
        throw new DomainError(
            "UNBALANCED_LEDGER_EVENT"
        );
    }
}

// ========================================
// UNIFIED LEDGER PROJECTION
// ========================================

export function projectLedger(
    ledger: FinancialLedger
): LedgerEvent[] {

    const result: LedgerEvent[] = [];

    const eventIds = new Set<string>();

    function append(event: LedgerEvent): void {

        if (eventIds.has(event.id)) {

            throw new DomainError(
                "RECORD_CONFLICT"
            );
        }

        assertBalancedEvent(event);

        eventIds.add(event.id);

        result.push(event);
    }

    // ====================================
    // 1. INCOME & EXPENSE
    // ====================================

    for (const entry of ledger.transactions) {

        const amount = toMovement(entry);

        append({
            id: `transaction:${entry.id}`,

            source: "transaction",
            sourceId: entry.id,

            currency: {
                kind: "account",
                accountId: entry.accountId,
            },

            date: entry.date,
            note: entry.note,

            postings: [
                posting(
                    "account",
                    entry.accountId,
                    amount
                ),

                posting(
                    entry.kind,
                    entry.accountId,
                    -amount
                ),
            ],

            report: {
                id: entry.id,
                accountId: entry.accountId,
                categoryId: entry.categoryId,
            },
        });
    }

    // ====================================
    // 2. INTERNAL TRANSFERS
    // ====================================

    for (const transfer of ledger.transfers) {

        if (!isValidTransfer(transfer)) {

            throw new DomainError(
                "INVALID_TRANSFER"
            );
        }

        append({
            id: `transfer:${transfer.id}`,

            source: "transfer",
            sourceId: transfer.id,

            currency: {
                kind: "explicit",
                code: transfer.currency,
            },

            date: transfer.date,
            note: transfer.note,

            postings: [
                posting(
                    "account",
                    transfer.fromAccountId,
                    -transfer.amountMinor
                ),

                posting(
                    "account",
                    transfer.toAccountId,
                    transfer.amountMinor
                ),
            ],
        });
    }

    // ====================================
    // 3. LOAN ORIGINATION
    // ====================================

    const loans = new Map(
        ledger.loans.map(
            loan => [loan.id, loan]
        )
    );

    for (const loan of ledger.loans) {

        if (!isValidLoan(loan)) {

            throw new DomainError(
                "INVALID_LOAN"
            );
        }

        const cash =
            loan.direction === "borrowed"
                ? loan.principalMinor
                : -loan.principalMinor;

        append({
            id: `loan:${loan.id}`,

            source: "loan",
            sourceId: loan.id,

            currency: {
                kind: "explicit",
                code: loan.currency,
            },

            date: loan.startDate,
            note: loan.note,

            postings: [
                posting(
                    "account",
                    loan.accountId,
                    cash
                ),

                posting(
                    "loan",
                    loan.id,
                    -cash
                ),
            ],
        });
    }

    // ====================================
    // 4. LOAN PAYMENTS
    // ====================================

    for (const payment of ledger.loanPayments) {

        if (!isValidLoanPayment(payment)) {

            throw new DomainError(
                "INVALID_LOAN_PAYMENT"
            );
        }

        const loan = loans.get(
            payment.loanId
        );

        if (!loan) {

            throw new DomainError(
                "RECORD_NOT_FOUND"
            );
        }

        const cost = safeAddMinor(
            payment.interestMinor,
            payment.feeMinor
        );

        const total = safeAddMinor(
            payment.principalMinor,
            cost
        );

        const borrowed =
            loan.direction === "borrowed";

        const cash =
            borrowed ? -total : total;

        const postings: LedgerPosting[] = [
            posting(
                "account",
                payment.accountId,
                cash
            ),
        ];

        if (payment.principalMinor > 0) {

            postings.push(
                posting(
                    "loan",
                    loan.id,
                    borrowed
                        ? payment.principalMinor
                        : -payment.principalMinor
                )
            );
        }

        if (cost > 0) {

            postings.push(
                posting(
                    borrowed
                        ? "expense"
                        : "income",

                    payment.accountId,

                    borrowed ? cost : -cost
                )
            );
        }

        append({
            id: `loanPayment:${payment.id}`,

            source: "loanPayment",
            sourceId: payment.id,

            currency: {
                kind: "explicit",
                code: loan.currency,
            },

            date: payment.date,

            note:
                `Lãi và phí · ${loan.counterparty}`,

            postings,

            report: cost > 0
                ? {
                    id: `loan-report:${payment.id}`,

                    accountId:
                        payment.accountId,

                    categoryId: borrowed
                        ? "loanCost"
                        : "loanIncome",
                }
                : undefined,
        });
    }

    // ====================================
    // 5. SAVINGS ORIGINATION
    // ====================================

    const savings = new Map(
        ledger.savingsPlans.map(
            plan => [plan.id, plan]
        )
    );

    for (const plan of ledger.savingsPlans) {

        if (!isValidSavingsPlan(plan)) {

            throw new DomainError(
                "INVALID_SAVINGS"
            );
        }

        append({
            id: `savingsPlan:${plan.id}`,

            source: "savingsPlan",
            sourceId: plan.id,

            currency: {
                kind: "explicit",
                code: plan.currency,
            },

            date: plan.startDate,
            note: plan.note,

            postings: [
                posting(
                    "account",
                    plan.accountId,
                    -plan.initialMinor
                ),

                posting(
                    "savings",
                    plan.id,
                    plan.initialMinor
                ),
            ],
        });
    }

    // ====================================
    // 6. SAVINGS MOVEMENTS
    // ====================================

    for (const movement of
        ledger.savingsMovements) {

        if (!isValidSavingsMovement(movement)) {

            throw new DomainError(
                "INVALID_SAVINGS_MOVEMENT"
            );
        }

        const plan = savings.get(
            movement.savingsId
        );

        if (!plan) {

            throw new DomainError(
                "RECORD_NOT_FOUND"
            );
        }

        const amount =
            movement.amountMinor;

        const event: LedgerEvent = {
            id: `savingsMovement:${movement.id}`,

            source: "savingsMovement",
            sourceId: movement.id,

            currency: {
                kind: "explicit",
                code: plan.currency,
            },

            date: movement.date,
            note: movement.note,

            postings: [],
        };

        switch (movement.kind) {

            case "deposit":

                append({
                    ...event,

                    postings: [
                        posting(
                            "account",
                            movement.accountId,
                            -amount
                        ),

                        posting(
                            "savings",
                            plan.id,
                            amount
                        ),
                    ],
                });

                break;

            case "withdrawal":

                append({
                    ...event,

                    postings: [
                        posting(
                            "savings",
                            plan.id,
                            -amount
                        ),

                        posting(
                            "account",
                            movement.accountId,
                            amount
                        ),
                    ],
                });

                break;

            case "interestCash":

                append({
                    ...event,

                    note:
                        `Lãi tiết kiệm · ${plan.name}`,

                    postings: [
                        posting(
                            "account",
                            movement.accountId,
                            amount
                        ),

                        posting(
                            "income",
                            movement.accountId,
                            -amount
                        ),
                    ],

                    report: {
                        id: `savings-report:${movement.id}`,

                        accountId:
                            movement.accountId,

                        categoryId:
                            "savingsInterest",
                    },
                });

                break;

            case "interestCapitalized":

                append({
                    ...event,

                    note:
                        `Lãi nhập gốc · ${plan.name}`,

                    postings: [
                        posting(
                            "savings",
                            plan.id,
                            amount
                        ),

                        posting(
                            "income",
                            movement.accountId,
                            -amount
                        ),
                    ],

                    report: {
                        id: `savings-report:${movement.id}`,

                        accountId:
                            movement.accountId,

                        categoryId:
                            "savingsInterest",
                    },
                });

                break;
        }
    }

    return result;
}

export function getPositionMovements(
    events: readonly LedgerEvent[],
    positionKind: LedgerPositionKind,
    positionId: string
): number[] {

    const movements: number[] = [];

    for (const event of events) {

        for (const item of event.postings) {

            if (
                item.positionKind === positionKind &&
                item.positionId === positionId
            ) {
                movements.push(item.amountMinor);
            }
        }
    }

    return movements;
}

export function getProjectedPosition(
    events: readonly LedgerEvent[],
    positionKind: LedgerPositionKind,
    positionId: string
): number {

    return sumMinor(
        getPositionMovements(
            events,
            positionKind,
            positionId
        )
    );
}