import {
    describe,
    it,
    expect,
} from "vitest";

import {
    parseMoney,
    formatMoney,
    minorToDecimalString,
    safeAddMinor,
    safeSubtractMinor,
    sumMinor,
    addMoney,
    subtractMoney,
    multiplyMinorByRatio,
} from "../../src/domain/finance/money.js";

import { calculateBalance } from
    "../../src/domain/finance/balance.js";

import { summarizeMonth } from
    "../../src/domain/finance/monthly-summary.js";

import { summarizeBudget } from
    "../../src/domain/finance/budget.js";

import { makeFinanceFixture } from
    "../fixtures/finance.fixture";

describe("Money Parsing", () => {

    it("parses zero-decimal currencies", () => {
        expect(parseMoney("1500", "JPY"))
            .toBe(1500);

        expect(parseMoney("100000", "VND"))
            .toBe(100000);
    });

    it("parses decimal currencies exactly", () => {
        expect(parseMoney("19.99", "USD"))
            .toBe(1999);

        expect(parseMoney("0.29", "USD"))
            .toBe(29);

        expect(parseMoney("12.9", "EUR"))
            .toBe(1290);
    });

    it("supports three decimal places", () => {
        expect(parseMoney("1.250", "KWD"))
            .toBe(1250);

        expect(parseMoney("0.001", "KWD"))
            .toBe(1);
    });

    it("supports signed amounts", () => {
        expect(parseMoney("-12.99", "USD"))
            .toBe(-1299);

        expect(parseMoney("+100", "JPY"))
            .toBe(100);

        expect(parseMoney("-0", "JPY"))
            .toBe(0);
    });

    it("rejects invalid money strings", () => {

        for (const input of [
            "",
            "abc",
            "NaN",
            "Infinity",
            "1e3",
            "1,000",
            "1.2.3",
            "12 USD",
        ]) {
            expect(() =>
                parseMoney(input, "USD")
            ).toThrow();
        }
    });

    it("rejects excess decimal precision", () => {
        expect(() =>
            parseMoney("100.5", "JPY")
        ).toThrow();

        expect(() =>
            parseMoney("1.999", "USD")
        ).toThrow();
    });

    it("protects the safe integer limit", () => {

        expect(
            parseMoney(
                "90071992547409.91",
                "USD"
            )
        ).toBe(Number.MAX_SAFE_INTEGER);

        expect(() =>
            parseMoney(
                "90071992547409.92",
                "USD"
            )
        ).toThrow();
    });
});

describe("Money Formatting", () => {

    it("converts minor units to exact decimals", () => {
        expect(minorToDecimalString(1299, "USD"))
            .toBe("12.99");

        expect(minorToDecimalString(100, "JPY"))
            .toBe("100");

        expect(minorToDecimalString(1250, "KWD"))
            .toBe("1.250");
    });

    it("formats USD using en-US locale", () => {
        expect(formatMoney(1299, "USD", "en-US"))
            .toBe("$12.99");
    });

    it("preserves negative fractional amounts", () => {
        expect(formatMoney(-1, "USD", "en-US"))
            .toBe("-$0.01");
    });

    it("formats large values without losing cents", () => {

        expect(
            formatMoney(
                Number.MAX_SAFE_INTEGER,
                "USD",
                "en-US"
            )
        ).toBe("$90,071,992,547,409.91");
    });

    it("supports different regional formats", () => {

        expect(
            formatMoney(1299, "EUR", "de-DE")
        ).toContain("12,99");
    });
});

describe("Safe Arithmetic", () => {

    it("adds, subtracts and sums integers", () => {

        expect(safeAddMinor(100, 200))
            .toBe(300);

        expect(safeSubtractMinor(100, 200))
            .toBe(-100);

        expect(sumMinor([100, 200, -50]))
            .toBe(250);
    });

    it("rejects unsafe integer operations", () => {

        expect(() =>
            safeAddMinor(
                Number.MAX_SAFE_INTEGER,
                1
            )
        ).toThrow();

        expect(() =>
            safeSubtractMinor(
                -Number.MAX_SAFE_INTEGER,
                1
            )
        ).toThrow();

        expect(() =>
            safeAddMinor(0.5, 1)
        ).toThrow();

        expect(() =>
            sumMinor([Infinity])
        ).toThrow();
    });

    it("only combines money of the same currency", () => {

        expect(
            addMoney(
                { currency: "USD", amountMinor: 100 },
                { currency: "USD", amountMinor: 200 }
            )
        ).toEqual({
            currency: "USD",
            amountMinor: 300,
        });

        expect(
            subtractMoney(
                { currency: "USD", amountMinor: 100 },
                { currency: "USD", amountMinor: 200 }
            )
        ).toEqual({
            currency: "USD",
            amountMinor: -100,
        });

        expect(() =>
            addMoney(
                { currency: "JPY", amountMinor: 100 },
                { currency: "USD", amountMinor: 100 }
            )
        ).toThrow();
    });
});

describe("Money Rounding", () => {

    it("rounds half away from zero", () => {

        expect(multiplyMinorByRatio(21, 1, 2))
            .toBe(11);

        expect(multiplyMinorByRatio(-21, 1, 2))
            .toBe(-11);

        expect(multiplyMinorByRatio(104, 1, 10))
            .toBe(10);
    });

    it("preserves exact intermediate calculations", () => {

        expect(
            multiplyMinorByRatio(
                Number.MAX_SAFE_INTEGER,
                100,
                100
            )
        ).toBe(Number.MAX_SAFE_INTEGER);
    });

    it("rejects invalid ratios and overflow", () => {

        expect(() =>
            multiplyMinorByRatio(100, 1, 0)
        ).toThrow();

        expect(() =>
            multiplyMinorByRatio(
                Number.MAX_SAFE_INTEGER,
                2,
                1
            )
        ).toThrow();
    });
});

describe("Financial Overflow Protection", () => {

    it("protects account balances from overflow", () => {

        expect(() =>
            calculateBalance(
                Number.MAX_SAFE_INTEGER,
                [1]
            )
        ).toThrow();
    });

    it("protects monthly reports from overflow", () => {

        const data = makeFinanceFixture();

        data.transactions[0].amountMinor =
            Number.MAX_SAFE_INTEGER;

        expect(() =>
            summarizeMonth(
                data.transactions,
                "wallet-jpy",
                "2026-11"
            )
        ).toThrow();
    });

    it("protects budget spending from overflow", () => {

        const data = makeFinanceFixture();

        data.transactions = [
            {
                ...data.transactions[0],
                amountMinor: Number.MAX_SAFE_INTEGER,
            },
            {
                ...data.transactions[0],
                id: "overflow-test",
                amountMinor: 1,
            },
        ];

        expect(() =>
            summarizeBudget(
                data.budgets[0],
                data.accounts,
                data.transactions
            )
        ).toThrow();
    });
});