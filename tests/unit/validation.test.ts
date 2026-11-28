import {
    describe,
    it,
    expect,
} from "vitest";

import {
    isNonEmptyString,
    isISODate,
    isISOMonth,
    isSafeMinor,
    isNonNegativeMinor,
    isPositiveMinor,
} from "../../src/domain/finance/validation.js";

import { DomainError } from
    "../../src/domain/finance/errors.js";

import { isValidAccount } from
    "../../src/domain/finance/account.js";

import { isValidTransaction } from
    "../../src/domain/finance/transaction.js";

import {
    createTransfer,
    isValidTransfer,
} from "../../src/domain/finance/transfer.js";

import {
    parseMoney,
    safeAddMinor,
} from "../../src/domain/finance/money.js";

import { parseBackup } from
    "../../src/storage/restore.js";

import {
    makeFinanceFixture,
    TEST_DATE,
} from "../fixtures/finance.fixture";

describe("Shared Validation", () => {

    it("validates non-empty strings", () => {
        expect(isNonEmptyString("MafiKO")).toBe(true);
        expect(isNonEmptyString("")).toBe(false);
        expect(isNonEmptyString("   ")).toBe(false);
        expect(isNonEmptyString(null)).toBe(false);
    });

    it("validates calendar dates", () => {
        expect(isISODate("2024-02-29")).toBe(true);
        expect(isISODate("2026-11-26")).toBe(true);
        expect(isISODate("2026-02-29")).toBe(false);
        expect(isISODate("2026-04-31")).toBe(false);
        expect(isISODate("2026-13-01")).toBe(false);
        expect(isISODate("26/11/2026")).toBe(false);
    });

    it("validates calendar months", () => {
        expect(isISOMonth("2026-11")).toBe(true);
        expect(isISOMonth("2026-00")).toBe(false);
        expect(isISOMonth("2026-13")).toBe(false);
        expect(isISOMonth("2026-1")).toBe(false);
    });

    it("validates safe signed minor units", () => {
        expect(isSafeMinor(-100)).toBe(true);
        expect(isSafeMinor(0)).toBe(true);
        expect(isSafeMinor(1.5)).toBe(false);
        expect(isSafeMinor("100")).toBe(false);
        expect(isSafeMinor(Infinity)).toBe(false);
    });

    it("distinguishes positive and nonnegative money", () => {
        expect(isPositiveMinor(100)).toBe(true);
        expect(isPositiveMinor(0)).toBe(false);
        expect(isNonNegativeMinor(0)).toBe(true);
        expect(isNonNegativeMinor(-1)).toBe(false);
    });
});

describe("Domain Validation", () => {

    it("validates accounts", () => {

        const account =
            makeFinanceFixture().accounts[0];

        expect(isValidAccount(account)).toBe(true);

        expect(isValidAccount({
            ...account,
            kind: "invalid",
        })).toBe(false);

        expect(isValidAccount({
            ...account,
            currency: "ZZZ",
        })).toBe(false);

        expect(isValidAccount({
            ...account,
            openingBalanceDate: "2026-02-30",
        })).toBe(false);
    });

    it("validates transaction data", () => {

        const entry =
            makeFinanceFixture().transactions[0];

        expect(isValidTransaction(entry)).toBe(true);

        expect(isValidTransaction({
            ...entry,
            amountMinor: 0,
        })).toBe(false);

        expect(isValidTransaction({
            ...entry,
            categoryId: "salary",
        })).toBe(false);

        expect(isValidTransaction({
            ...entry,
            kind: "invalid",
        })).toBe(false);
    });

    it("rejects transfers to the same account", () => {

        const account =
            makeFinanceFixture().accounts[0];

        expect(() => createTransfer(
            account,
            account,
            1000,
            TEST_DATE,
            ""
        )).toThrow(DomainError);
    });

    it("rejects transfers before opening date", () => {

        const account =
            makeFinanceFixture().accounts[0];

        const target = {
            ...account,
            id: "target",
        };

        expect(() => createTransfer(
            account,
            target,
            1000,
            "2026-11-25",
            ""
        )).toThrow(DomainError);
    });

    it("validates transfer records", () => {

        const account =
            makeFinanceFixture().accounts[0];

        const target = {
            ...account,
            id: "target",
        };

        const transfer = createTransfer(
            account,
            target,
            1000,
            TEST_DATE,
            ""
        );

        expect(isValidTransfer(transfer)).toBe(true);

        expect(isValidTransfer({
            ...transfer,
            toAccountId: account.id,
        })).toBe(false);
    });
});

describe("Domain Errors", () => {

    it("exposes stable error codes", () => {

        const error =
            new DomainError("INVALID_AMOUNT");

        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe("DomainError");
        expect(error.code).toBe("INVALID_AMOUNT");
        expect(error.message.length)
            .toBeGreaterThan(0);
    });

    it("returns domain errors from money parsing", () => {

        expect(() =>
            parseMoney("invalid", "USD")
        ).toThrow(DomainError);
    });

    it("returns domain errors on overflow", () => {

        expect(() => safeAddMinor(
            Number.MAX_SAFE_INTEGER,
            1
        )).toThrow(DomainError);
    });

    it("rejects malformed accounts during restore", () => {

        const data = makeFinanceFixture();

        const invalid = {
            ...data,
            accounts: [{
                ...data.accounts[0],
                kind: "invalid",
            }],
        };

        expect(() => parseBackup(
            JSON.stringify(invalid)
        )).toThrow(DomainError);
    });

    it("rejects transactions with missing accounts", () => {

        const data = makeFinanceFixture();

        data.transactions[0].accountId =
            "missing-account";

        expect(() => parseBackup(
            JSON.stringify(data)
        )).toThrow(DomainError);
    });
});