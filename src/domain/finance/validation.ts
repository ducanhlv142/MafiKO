export function isNonEmptyString(
    value: unknown
): value is string {
    return (
        typeof value === "string" &&
        value.trim().length > 0
    );
}

export function isISODate(
    value: unknown
): value is string {

    if (
        typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
        return false;
    }

    const date = new Date(
        `${value}T00:00:00Z`
    );

    return (
        Number.isFinite(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
    );
}

export function isISOMonth(
    value: unknown
): value is string {
    return (
        typeof value === "string" &&
        /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
    );
}

export function isSafeMinor(
    value: unknown
): value is number {
    return (
        typeof value === "number" &&
        Number.isSafeInteger(value)
    );
}

export function isNonNegativeMinor(
    value: unknown
): value is number {
    return isSafeMinor(value) && value >= 0;
}

export function isPositiveMinor(
    value: unknown
): value is number {
    return isSafeMinor(value) && value > 0;
}