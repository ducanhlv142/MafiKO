import {
    describe,
    it,
    expect,
} from "vitest";

import { buildFinanceOverview } from
    "../../src/domain/finance/finance-overview.js";

import { createLedgerView } from
    "../../src/domain/finance/ledger-view.js";

import { createTransfer } from
    "../../src/domain/finance/transfer.js";

import {
    makeFinanceFixture,
    TEST_DATE,
} from "../fixtures/finance.fixture";

describe("Unified Finance Overview", () => {

    it("calculates correct assets and liabilities", () => {

        const overview = buildFinanceOverview(
            makeFinanceFixture()
        );

        expect(overview.currencyTotals).toEqual([
            {
                currency: "JPY",

                assetsMinor: 9148,

                liabilitiesMinor: 15000,

                netWorthMinor: -5852,
            },
        ]);
    });

    it("calculates every financial position", () => {

        const overview = buildFinanceOverview(
            makeFinanceFixture()
        );

        expect(
            overview.positions.map(position => ({
                id: position.record.id,
                net: position.netMinor,
            }))
        ).toEqual([
            {
                id: "wallet-jpy",
                net: 3598,
            },
            {
                id: "loan-borrowed",
                net: -15000,
            },
            {
                id: "loan-lent",
                net: 2000,
            },
            {
                id: "saving-1",
                net: 3550,
            },
        ]);
    });

    it("preserves income and expense reporting", () => {

        const overview = buildFinanceOverview(
            makeFinanceFixture()
        );

        expect(
            overview.reportTransactions
        ).toHaveLength(6);

        const income = overview.reportTransactions
            .filter(t => t.kind === "income")
            .reduce(
                (sum, t) => sum + t.amountMinor,
                0
            );

        const expense = overview.reportTransactions
            .filter(t => t.kind === "expense")
            .reduce(
                (sum, t) => sum + t.amountMinor,
                0
            );

        expect(income).toBe(300);

        expect(expense).toBe(11152);
    });

    it("reuses ledger positions for account balances", () => {

        const view = createLedgerView(
            makeFinanceFixture()
        );

        expect(
            view.getAccountBalance("wallet-jpy")
        ).toBe(3598);

        expect(
            view.getPositionNet(
                "savings",
                "saving-1"
            )
        ).toBe(3550);

        expect(
            view.getPositionNet(
                "loan",
                "loan-borrowed"
            )
        ).toBe(-15000);
    });

    it("preserves net worth during transfers", () => {

        const data = makeFinanceFixture();

        const source = data.accounts[0];

        const target = {
            ...source,

            id: "bank-jpy",

            kind: "bank" as const,

            openingBalanceMinor: 10000,
        };

        data.accounts.push(target);

        const before = buildFinanceOverview(data);

        data.transfers.push(
            createTransfer(
                source,
                target,
                1000,
                TEST_DATE,
                ""
            )
        );

        const after = buildFinanceOverview(data);

        expect(after.currencyTotals)
            .toEqual(before.currencyTotals);

        const view = createLedgerView(data);

        expect(
            view.getAccountBalance(source.id)
        ).toBe(2598);

        expect(
            view.getAccountBalance(target.id)
        ).toBe(11000);
    });

    it("keeps different currencies separate", () => {

        const data = makeFinanceFixture();

        data.accounts.push({
            ...data.accounts[0],

            id: "wallet-vnd",

            currency: "VND",

            openingBalanceMinor: 1000000,
        });

        const overview =
            buildFinanceOverview(data);

        expect(overview.currencyTotals)
            .toHaveLength(2);

        expect(
            overview.currencyTotals.find(
                total => total.currency === "JPY"
            )?.netWorthMinor
        ).toBe(-5852);

        expect(
            overview.currencyTotals.find(
                total => total.currency === "VND"
            )?.netWorthMinor
        ).toBe(1000000);
    });

    it("treats credit card debt as a liability", () => {

        const data = makeFinanceFixture();

        data.accounts.push({
            ...data.accounts[0],

            id: "card-jpy",

            kind: "credit_card",

            openingBalanceMinor: 1000,
        });

        const overview =
            buildFinanceOverview(data);

        expect(
            overview.positions.find(
                position =>
                    position.record.id === "card-jpy"
            )?.netMinor
        ).toBe(-1000);

        expect(
            overview.currencyTotals[0]
                .liabilitiesMinor
        ).toBe(16000);

        expect(
            overview.currencyTotals[0]
                .netWorthMinor
        ).toBe(-6852);
    });

    it("rejects orphan account references", () => {

        const data = makeFinanceFixture();

        data.transactions[0].accountId =
            "missing-account";

        expect(() =>
            buildFinanceOverview(data)
        ).toThrow(
            "Không tìm thấy tài khoản."
        );
    });

    it("rejects inconsistent transfer currencies", () => {

        const data = makeFinanceFixture();

        const source = data.accounts[0];

        const target = {
            ...source,

            id: "bank-jpy",
        };

        data.transfers.push(
            createTransfer(
                source,
                target,
                1000,
                TEST_DATE,
                ""
            )
        );

        data.accounts.push({
            ...target,

            currency: "VND",
        });

        expect(() =>
            buildFinanceOverview(data)
        ).toThrow();
    });

    it("rejects events before account opening", () => {

        const data = makeFinanceFixture();

        data.transactions[0].date =
            "2026-11-25";

        expect(() =>
            buildFinanceOverview(data)
        ).toThrow();
    });

    it("rejects loan principal overpayments", () => {

        const data = makeFinanceFixture();

        data.loanPayments[0].principalMinor =
            20001;

        expect(() =>
            buildFinanceOverview(data)
        ).toThrow();
    });

    it("rejects unsafe aggregate financial values", () => {

        const data = makeFinanceFixture();

        data.accounts.push({
            ...data.accounts[0],

            id: "large-wallet",

            openingBalanceMinor:
                Number.MAX_SAFE_INTEGER,
        });

        expect(() =>
            buildFinanceOverview(data)
        ).toThrow();
    });

    it("supports an empty financial snapshot", () => {

        const overview = buildFinanceOverview({
            accounts: [],
            transactions: [],
            transfers: [],
            loans: [],
            loanPayments: [],
            savingsPlans: [],
            savingsMovements: [],
        });

        expect(overview).toEqual({
            positions: [],
            currencyTotals: [],
            reportTransactions: [],
        });
    });
});