import type { Account } from "./account";
import type { Transaction } from "./transaction";
import type { ExpenseCategoryId } from "./category";
import { isValidCurrency } from "./currency.js";
import { categories } from "./category.js";
import {
    safeAddMinor,
    safeSubtractMinor,
} from "./money.js";

export interface Budget {
    id: string;
    month: string;
    currency: Account["currency"];
    categoryId: ExpenseCategoryId;
    limitMinor: number;
}

export type BudgetStatus =
    | "normal"
    | "warning"
    | "reached"
    | "exceeded";

export interface BudgetSummary {
    budget: Budget;
    spentMinor: number;
    remainingMinor: number;
    usagePercent: number;
    status: BudgetStatus;
}

export function budgetId(
    month: string,
    currency: Account["currency"],
    categoryId: ExpenseCategoryId,
): string {
    return `${month}:${currency}:${categoryId}`;
}

export function isValidBudget(value: unknown): value is Budget {
    if (!value || typeof value !== "object") {
        return false;
    }

    const b = value as Budget;

    return (
        typeof b.month === "string" &&
        /^\d{4}-(0[1-9]|1[0-2])$/.test(b.month) &&
        isValidCurrency(b.currency) &&
        Object.hasOwn(categories.expense, b.categoryId) &&
        Number.isSafeInteger(b.limitMinor) &&
        b.limitMinor > 0 &&
        b.id === budgetId(
            b.month,
            b.currency,
            b.categoryId
        )
    );
}

export function createBudget(
    month: string,
    currency: Account["currency"],
    categoryId: ExpenseCategoryId,
    limitMinor: number,
): Budget {
    const budget: Budget = {
        id: budgetId(month, currency, categoryId),
        month,
        currency,
        categoryId,
        limitMinor,
    };

    if (!isValidBudget(budget)) {
        throw new Error("Ngân sách không hợp lệ.");
    }

    return budget;
}

export function summarizeBudget(
    budget: Budget,
    accounts: readonly Account[],
    transactions: readonly Transaction[],
): BudgetSummary {
    if (!isValidBudget(budget)) {
        throw new Error("Ngân sách không hợp lệ.");
    }

    const accountIds = new Set(
        accounts
            .filter(a => a.currency === budget.currency)
            .map(a => a.id)
    );

    let spentMinor = 0;

    for (const t of transactions) {
        if (
            t.kind !== "expense" ||
            t.date.slice(0, 7) !== budget.month ||
            t.categoryId !== budget.categoryId ||
            !accountIds.has(t.accountId)
        ) {
            continue;
        }

        spentMinor = safeAddMinor(
            spentMinor,
            t.amountMinor
        );
    }

    const remainingMinor = safeSubtractMinor(
        budget.limitMinor,
        spentMinor
    );

    const usagePercent =
        spentMinor / budget.limitMinor * 100;

    let status: BudgetStatus = "normal";

    if (spentMinor > budget.limitMinor) {
        status = "exceeded";
    } else if (spentMinor === budget.limitMinor) {
        status = "reached";
    } else if (
        BigInt(spentMinor) * 100n >=
        BigInt(budget.limitMinor) * 80n
    ) {
        status = "warning";
    }

    return {
        budget,
        spentMinor,
        remainingMinor,
        usagePercent,
        status,
    };
}