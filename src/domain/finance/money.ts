import type { CurrencyCode } from "./currency";

import {
    getCurrencyDecimals,
    getCurrencyFactor,
} from "./currency.js";

export interface Money {
    readonly currency: CurrencyCode;
    readonly amountMinor: number;
}

// ========================================
// 1. SAFE INTEGER VALIDATION
// ========================================

export function assertSafeMinor(
    value: number
): void {
    if (!Number.isSafeInteger(value)) {
        throw new Error(
            "Số tiền vượt giới hạn số nguyên an toàn."
        );
    }
}

function fromBigInt(value: bigint): number {
    const max = BigInt(Number.MAX_SAFE_INTEGER);

    if (value > max || value < -max) {
        throw new Error(
            "Số tiền vượt giới hạn số nguyên an toàn."
        );
    }

    return Number(value);
}

// ========================================
// 2. MONEY PARSING
// ========================================

export function parseMoney(
    input: string,
    currency: CurrencyCode
): number {

    const text = input.trim();

    if (!/^[+-]?\d+(\.\d+)?$/.test(text)) {
        throw new Error(
            "Định dạng số tiền không hợp lệ."
        );
    }

    const decimals = getCurrencyDecimals(currency);

    const negative = text.startsWith("-");

    const unsigned = text.replace(/^[+-]/, "");

    const [whole, fraction = ""] =
        unsigned.split(".");

    if (fraction.length > decimals) {
        throw new Error(
            `${currency} chỉ hỗ trợ ${decimals} chữ số thập phân.`
        );
    }

    const digits = (
        whole + fraction.padEnd(decimals, "0")
    ).replace(/^0+/, "") || "0";

    if (digits.length > 16) {
        throw new Error(
            "Số tiền vượt giới hạn an toàn."
        );
    }

    let result = BigInt(digits);

    if (negative) {
        result = -result;
    }

    return fromBigInt(result);
}

// ========================================
// 3. DECIMAL CONVERSION
// ========================================

export function minorToDecimalString(
    amountMinor: number,
    currency: CurrencyCode
): string {

    assertSafeMinor(amountMinor);

    const decimals =
        getCurrencyDecimals(currency);

    const factor =
        BigInt(getCurrencyFactor(currency));

    const negative = amountMinor < 0;

    const absolute =
        BigInt(Math.abs(amountMinor));

    const whole = absolute / factor;

    const fraction = absolute % factor;

    const sign = negative ? "-" : "";

    if (decimals === 0) {
        return `${sign}${whole}`;
    }

    return (
        `${sign}${whole}.` +
        fraction.toString().padStart(decimals, "0")
    );
}

// ========================================
// 4. LOCALIZED MONEY FORMATTING
// ========================================

export function formatMoney(
    amountMinor: number,
    currency: CurrencyCode,
    locale: string = "vi-VN"
): string {

    assertSafeMinor(amountMinor);

    const decimals =
        getCurrencyDecimals(currency);

    const factor =
        BigInt(getCurrencyFactor(currency));

    const absolute =
        BigInt(Math.abs(amountMinor));

    const whole = absolute / factor;

    const fraction = absolute % factor;

    const formatter = new Intl.NumberFormat(
        locale,
        {
            style: "currency",
            currency,

            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
        }
    );

    // Preserve the negative sign even for -0.01.
    const signedWhole =
        amountMinor < 0
            ? whole === 0n
                ? -0
                : -whole
            : whole;

    const parts = formatter.formatToParts(
        signedWhole
    );

    if (decimals === 0) {
        return parts.map(p => p.value).join("");
    }

    const fractionFormatter =
        new Intl.NumberFormat(locale, {
            useGrouping: false,

            minimumIntegerDigits: decimals,

            maximumFractionDigits: 0,

            numberingSystem:
                formatter.resolvedOptions()
                    .numberingSystem,
        });

    const fractionText =
        fractionFormatter.format(fraction);

    return parts.map(part =>
        part.type === "fraction"
            ? fractionText
            : part.value
    ).join("");
}

// ========================================
// 5. SAFE ARITHMETIC
// ========================================

export function safeAddMinor(
    a: number,
    b: number
): number {

    assertSafeMinor(a);
    assertSafeMinor(b);

    return fromBigInt(
        BigInt(a) + BigInt(b)
    );
}

export function safeSubtractMinor(
    a: number,
    b: number
): number {

    assertSafeMinor(a);
    assertSafeMinor(b);

    return fromBigInt(
        BigInt(a) - BigInt(b)
    );
}

export function sumMinor(
    values: readonly number[]
): number {

    let total = 0n;

    for (const value of values) {
        assertSafeMinor(value);

        total += BigInt(value);
    }

    return fromBigInt(total);
}

// ========================================
// 6. CURRENCY-SAFE OPERATIONS
// ========================================

function assertSameCurrency(
    a: Money,
    b: Money
): void {

    if (a.currency !== b.currency) {
        throw new Error(
            "Không thể tính toán trực tiếp giữa hai loại tiền."
        );
    }
}

export function addMoney(
    a: Money,
    b: Money
): Money {

    assertSameCurrency(a, b);

    return {
        currency: a.currency,

        amountMinor: safeAddMinor(
            a.amountMinor,
            b.amountMinor
        ),
    };
}

export function subtractMoney(
    a: Money,
    b: Money
): Money {

    assertSameCurrency(a, b);

    return {
        currency: a.currency,

        amountMinor: safeSubtractMinor(
            a.amountMinor,
            b.amountMinor
        ),
    };
}

// ========================================
// 7. EXACT RATIO & ROUNDING
// ========================================

export function multiplyMinorByRatio(
    amountMinor: number,
    numerator: number,
    denominator: number
): number {

    assertSafeMinor(amountMinor);

    assertSafeMinor(numerator);
    assertSafeMinor(denominator);

    if (denominator <= 0) {
        throw new Error(
            "Mẫu số phải lớn hơn 0."
        );
    }

    const product =
        BigInt(amountMinor) *
        BigInt(numerator);

    const divisor = BigInt(denominator);

    const negative = product < 0n;

    const absolute =
        negative ? -product : product;

    const quotient = absolute / divisor;

    const remainder = absolute % divisor;

    // Round half away from zero.
    const rounded =
        remainder * 2n >= divisor
            ? quotient + 1n
            : quotient;

    return fromBigInt(
        negative ? -rounded : rounded
    );
}