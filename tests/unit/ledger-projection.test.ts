import {
    describe,
    it,
    expect,
} from "vitest";

import {
    projectLedger,
    assertBalancedEvent,
    getProjectedPosition,
} from "../../src/domain/finance/ledger-projection.js";

import {
    getAccountBalance,
    getReportTransactions,
} from "../../src/domain/finance/ledger.js";

import { sumMinor } from
    "../../src/domain/finance/money.js";

import { createTransfer } from
    "../../src/domain/finance/transfer.js";

import {
    makeFinanceFixture,
    TEST_DATE,
} from "../fixtures/finance.fixture";

describe("Unified Ledger Projection", () => {

    it("creates balanced events for every operation", () => {

        const data = makeFinanceFixture();

        const events = projectLedger(data);

        expect(events).toHaveLength(11);

        for (const event of events) {

            expect(
                sumMinor(
                    event.postings.map(
                        p => p.amountMinor
                    )
                )
            ).toBe(0);
        }
    });

    it("projects correct financial positions", () => {

        const data = makeFinanceFixture();

        const events = projectLedger(data);

        expect(
            getProjectedPosition(
                events,
                "account",
                "wallet-jpy"
            )
        ).toBe(-1402);

        expect(
            getProjectedPosition(
                events,
                "loan",
                "loan-borrowed"
            )
        ).toBe(-15000);

        expect(
            getProjectedPosition(
                events,
                "loan",
                "loan-lent"
            )
        ).toBe(2000);

        expect(
            getProjectedPosition(
                events,
                "savings",
                "saving-1"
            )
        ).toBe(3550);
    });

    it("preserves income and expense reports", () => {

        const data = makeFinanceFixture();

        const report = getReportTransactions(data);

        const income = sumMinor(
            report
                .filter(t => t.kind === "income")
                .map(t => t.amountMinor)
        );

        const expense = sumMinor(
            report
                .filter(t => t.kind === "expense")
                .map(t => t.amountMinor)
        );

        expect(report).toHaveLength(6);

        expect(income).toBe(300);

        expect(expense).toBe(11152);

        expect(
            getAccountBalance(
                data.accounts[0],
                data
            )
        ).toBe(3598);
    });

    it("does not create cash from capitalized interest", () => {

        const data = makeFinanceFixture();

        const events = projectLedger(data);

        const event = events.find(
            e => e.id ===
                "savingsMovement:movement-4"
        );

        expect(event).toBeDefined();

        expect(event?.postings).toEqual([
            {
                positionKind: "savings",
                positionId: "saving-1",
                amountMinor: 50,
            },
            {
                positionKind: "income",
                positionId: "wallet-jpy",
                amountMinor: -50,
            },
        ]);
    });

    it("preserves value during internal transfers", () => {

        const data = makeFinanceFixture();

        const source = data.accounts[0];

        const target = {
            ...source,

            id: "bank-jpy",

            kind: "bank" as const,
        };

        const transfer = createTransfer(
            source,
            target,
            1000,
            TEST_DATE,
            ""
        );

        data.transfers = [transfer];

        const events = projectLedger(data);

        const event = events.find(
            e => e.source === "transfer"
        );

        expect(event?.postings).toEqual([
            {
                positionKind: "account",
                positionId: source.id,
                amountMinor: -1000,
            },
            {
                positionKind: "account",
                positionId: target.id,
                amountMinor: 1000,
            },
        ]);

        expect(event?.report).toBeUndefined();
    });

    it("does not report loan principal as expense", () => {

        const data = makeFinanceFixture();

        data.loanPayments[0].interestMinor = 0;
        data.loanPayments[0].feeMinor = 0;

        const events = projectLedger(data);

        const event = events.find(
            e => e.id ===
                "loanPayment:payment-1"
        );

        expect(event?.report).toBeUndefined();

        expect(event?.postings).toEqual([
            {
                positionKind: "account",
                positionId: "wallet-jpy",
                amountMinor: -5000,
            },
            {
                positionKind: "loan",
                positionId: "loan-borrowed",
                amountMinor: 5000,
            },
        ]);
    });

    it("rejects orphan loan payments", () => {

        const data = makeFinanceFixture();

        data.loanPayments[0].loanId =
            "missing-loan";

        expect(() =>
            projectLedger(data)
        ).toThrow();
    });

    it("rejects duplicate financial events", () => {

        const data = makeFinanceFixture();

        data.transactions.push({
            ...data.transactions[0],
        });

        expect(() =>
            projectLedger(data)
        ).toThrow();
    });

    it("rejects unbalanced ledger events", () => {

        const data = makeFinanceFixture();

        const event = projectLedger(data)[0];

        expect(() => assertBalancedEvent({
            ...event,

            postings: [
                {
                    positionKind: "account",
                    positionId: "wallet-jpy",
                    amountMinor: -1000,
                },
                {
                    positionKind: "expense",
                    positionId: "wallet-jpy",
                    amountMinor: 900,
                },
            ],
        })).toThrow();
    });

    it("does not mutate original financial records", () => {

        const data = makeFinanceFixture();

        const original = structuredClone(data);

        projectLedger(data);

        getReportTransactions(data);

        getAccountBalance(
            data.accounts[0],
            data
        );

        expect(data).toEqual(original);
    });
});