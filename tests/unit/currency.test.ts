import { describe, it, expect } from "vitest";

import {
    currencies,
    isKnownCurrency,
    isValidCurrency,
    getCurrencyDefinition,
    getCurrencyDecimals,
    getCurrencyFactor,
    listSupportedCurrencies,
} from "../../src/domain/finance/currency.js";

import { parseBackup } from
    "../../src/storage/restore.js";

import { makeFinanceFixture } from
    "../fixtures/finance.fixture";

describe("Currency Registry", () => {

    it("recognizes registered currencies", () => {

        expect(isKnownCurrency("VND")).toBe(true);
        expect(isKnownCurrency("JPY")).toBe(true);
        expect(isKnownCurrency("USD")).toBe(true);
        expect(isKnownCurrency("EUR")).toBe(true);
    });

    it("rejects unknown currency codes", () => {

        expect(isKnownCurrency("ZZZ")).toBe(false);
        expect(isKnownCurrency("")).toBe(false);
        expect(isKnownCurrency("usd")).toBe(false);
    });

    it("rejects invalid input types", () => {

        expect(isKnownCurrency(null)).toBe(false);
        expect(isKnownCurrency(undefined)).toBe(false);
        expect(isKnownCurrency(123)).toBe(false);
        expect(isKnownCurrency({})).toBe(false);
    });

    it("rejects inherited object properties", () => {

        expect(isKnownCurrency("constructor")).toBe(false);
        expect(isKnownCurrency("toString")).toBe(false);
        expect(isKnownCurrency("__proto__")).toBe(false);
    });

    it("keeps existing currencies supported", () => {

        expect(isValidCurrency("JPY")).toBe(true);
        expect(isValidCurrency("VND")).toBe(true);
    });

    it("keeps decimal currencies disabled until migration", () => {

        expect(isKnownCurrency("USD")).toBe(true);

        expect(isValidCurrency("USD")).toBe(false);
        expect(isValidCurrency("EUR")).toBe(false);
        expect(isValidCurrency("KWD")).toBe(false);
    });

    it.each([
        ["VND", 0],
        ["JPY", 0],
        ["KRW", 0],
        ["USD", 2],
        ["EUR", 2],
        ["GBP", 2],
        ["KWD", 3],
    ] as const)(
        "uses correct precision for %s",
        (currency, decimals) => {

            expect(
                getCurrencyDecimals(currency)
            ).toBe(decimals);

            expect(
                getCurrencyFactor(currency)
            ).toBe(10 ** decimals);
        }
    );

    it("returns currency metadata", () => {

        expect(
            getCurrencyDefinition("JPY")
        ).toEqual({
            name: "Japanese Yen",
            decimals: 0,
        });
    });

    it("only exposes enabled currencies", () => {

        expect(
            listSupportedCurrencies()
        ).toEqual(["VND", "JPY"]);
    });

    it("has valid registry definitions", () => {

        for (const [code, definition] of
            Object.entries(currencies)) {

            expect(code).toMatch(/^[A-Z]{3}$/);

            expect(
                Number.isInteger(definition.decimals)
            ).toBe(true);

            expect(
                definition.decimals
            ).toBeGreaterThanOrEqual(0);
        }
    });

    it("preserves existing backup compatibility", () => {

        const data = makeFinanceFixture();

        expect(
            parseBackup(JSON.stringify(data))
        ).toEqual(data);
    });
});