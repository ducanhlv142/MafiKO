interface CurrencyDefinition {
    readonly name: string;
    readonly decimals: number;
}
import { DomainError } from "./errors.js";
export const currencies = {
    VND: { name: "Vietnamese Dong", decimals: 0 },
    JPY: { name: "Japanese Yen", decimals: 0 },
    USD: { name: "US Dollar", decimals: 2 },
    EUR: { name: "Euro", decimals: 2 },
    GBP: { name: "British Pound", decimals: 2 },
    CNY: { name: "Chinese Yuan", decimals: 2 },
    KRW: { name: "South Korean Won", decimals: 0 },
    SGD: { name: "Singapore Dollar", decimals: 2 },
    THB: { name: "Thai Baht", decimals: 2 },
    AUD: { name: "Australian Dollar", decimals: 2 },
    CAD: { name: "Canadian Dollar", decimals: 2 },
    CHF: { name: "Swiss Franc", decimals: 2 },
    HKD: { name: "Hong Kong Dollar", decimals: 2 },
    KWD: { name: "Kuwaiti Dinar", decimals: 3 },
} as const satisfies Record<string, CurrencyDefinition>;

export type CurrencyCode = keyof typeof currencies;

// Only currencies supported by the complete financial pipeline.
export const supportedCurrencies = [
    "VND",
    "JPY",
] as const satisfies readonly CurrencyCode[];

export type SupportedCurrencyCode =
    typeof supportedCurrencies[number];

const supportedSet: ReadonlySet<string> =
    new Set(supportedCurrencies);

export function isKnownCurrency(
    value: unknown
): value is CurrencyCode {
    return (
        typeof value === "string" &&
        Object.hasOwn(currencies, value)
    );
}

export function isValidCurrency(
    value: unknown
): value is SupportedCurrencyCode {
    return (
        typeof value === "string" &&
        supportedSet.has(value)
    );
}

export function getCurrencyDefinition(
    currency: CurrencyCode
): CurrencyDefinition {

    if (!isKnownCurrency(currency)) {
        throw new DomainError("UNKNOWN_CURRENCY");
    }

    return currencies[currency];
}

export function getCurrencyDecimals(
    currency: CurrencyCode
): number {
    return getCurrencyDefinition(currency).decimals;
}

export function getCurrencyFactor(
    currency: CurrencyCode
): number {
    return 10 ** getCurrencyDecimals(currency);
}

export function listSupportedCurrencies():
    readonly SupportedCurrencyCode[] {
    return [...supportedCurrencies];
}