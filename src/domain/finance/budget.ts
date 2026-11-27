import type { Account } from "./account";
import type { Transaction } from "./transaction";
import type { ExpenseCategoryId } from "./category";
import { isValidCurrency } from "./currency.js";
import { categories } from "./category.js";
import {
    safeAddMinor,
    safeSubtractMinor,
} from "./money.js";
import {
    isISOMonth,
    isPositiveMinor,
} from "./validation.js";

import { DomainError } from "./errors.js";

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
        isISOMonth(b.month) &&
        isValidCurrency(b.currency) &&
        Object.hasOwn(categories.expense, b.categoryId) &&
        isPositiveMinor(b.limitMinor) &&
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
        throw new DomainError("INVALID_BUDGET");
    }

    return budget;
}

export function summarizeBudget(
    budget: Budget,
    accounts: readonly Account[],
    transactions: readonly Transaction[],
): BudgetSummary {
    if (!isValidBudget(budget)) {
        throw new DomainError("INVALID_BUDGET");
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