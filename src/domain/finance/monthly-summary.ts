import type { Transaction } from "./transaction";
import {
    safeAddMinor,
    safeSubtractMinor,
} from "./money.js";

export function summarizeMonth(
    transactions: readonly Transaction[],
    accountId: string,
    month: string, // Ví dụ: "2026-11"
) {
    let income = 0;
    let expense = 0;
    const expenseByCategory = new Map<string, number>();

    for (const entry of transactions) {
        if (entry.accountId !== accountId || entry.date.slice(0, 7) !== month) {
            continue;
        }

        if (entry.kind === "income") {
            income = safeAddMinor(
                income,
                entry.amountMinor
            );
            continue;
        }

        expense = safeAddMinor(
            expense,
            entry.amountMinor
        );
        const categoryId = entry.categoryId ?? "uncategorized";
        const previous = expenseByCategory.get(categoryId) ?? 0;
        expenseByCategory.set(
            categoryId,
            safeAddMinor(
                previous,
                entry.amountMinor
            )
        );
    }

    return {
        income,
        expense,

        net: safeSubtractMinor(
            income,
            expense
        ),

        expenseByCategory,
    };
}