import type { Account } from "./account";
import { isValidCurrency } from "./currency.js";
import {
    safeAddMinor as safeAdd,
} from "./money.js";
import {
    isISODate as validDate,
    isNonNegativeMinor as validMoney,
    isNonEmptyString as validText,
} from "./validation.js";

import { DomainError } from "./errors.js";

export type SavingsKind =
    | "flexible"
    | "fixed";

export type SavingsInterestMethod =
    | "simple"
    | "monthlyCompound";

export type SavingsMovementKind =
    | "deposit"
    | "withdrawal"
    | "interestCash"
    | "interestCapitalized";

export interface SavingsPlan {
    id: string;
    name: string;

    kind: SavingsKind;

    accountId: string;
    currency: Account["currency"];

    initialMinor: number;

    startDate: string;
    maturityDate?: string;

    annualRateBps: number;
    interestMethod: SavingsInterestMethod;

    note: string;
}

export interface SavingsMovement {
    id: string;

    savingsId: string;
    accountId: string;

    kind: SavingsMovementKind;

    amountMinor: number;

    date: string;
    note: string;
}

export interface SavingsSummary {
    initialMinor: number;

    depositedMinor: number;
    withdrawnMinor: number;

    interestCashMinor: number;
    interestCapitalizedMinor: number;
    totalInterestMinor: number;

    balanceMinor: number;

    status: "active" | "closed";
}

export function isValidSavingsPlan(
    value: unknown
): value is SavingsPlan {

    if (!value || typeof value !== "object") {
        return false;
    }

    const plan = value as SavingsPlan;

    return (
        validText(plan.id) &&
        validText(plan.name) &&
        validText(plan.accountId) &&

        (
            plan.kind === "flexible" ||
            plan.kind === "fixed"
        ) &&

        isValidCurrency(plan.currency) &&

        validMoney(plan.initialMinor) &&
        plan.initialMinor > 0 &&

        validDate(plan.startDate) &&

        (
            plan.kind === "fixed"
                ? (
                    validDate(plan.maturityDate) &&
                    plan.maturityDate > plan.startDate
                )
                : plan.maturityDate === undefined
        ) &&

        validMoney(plan.annualRateBps) &&

        (
            plan.interestMethod === "simple" ||
            plan.interestMethod === "monthlyCompound"
        ) &&

        typeof plan.note === "string"
    );
}

export function isValidSavingsMovement(
    value: unknown
): value is SavingsMovement {

    if (!value || typeof value !== "object") {
        return false;
    }

    const movement = value as SavingsMovement;

    return (
        validText(movement.id) &&
        validText(movement.savingsId) &&
        validText(movement.accountId) &&

        (
            movement.kind === "deposit" ||
            movement.kind === "withdrawal" ||
            movement.kind === "interestCash" ||
            movement.kind === "interestCapitalized"
        ) &&

        validMoney(movement.amountMinor) &&
        movement.amountMinor > 0 &&

        validDate(movement.date) &&

        typeof movement.note === "string"
    );
}

export function createSavingsPlan(
    input: Omit<SavingsPlan, "id">
): SavingsPlan {

    const plan: SavingsPlan = {
        ...input,
        id: crypto.randomUUID(),
    };

    if (!isValidSavingsPlan(plan)) {
        throw new Error(
            "Sổ tiết kiệm không hợp lệ."
        );
    }

    return plan;
}

export function createSavingsMovement(
    input: Omit<SavingsMovement, "id">
): SavingsMovement {

    const movement: SavingsMovement = {
        ...input,
        id: crypto.randomUUID(),
    };

    if (!isValidSavingsMovement(movement)) {
        throw new Error(
            "Giao dịch tiết kiệm không hợp lệ."
        );
    }

    return movement;
}

const movementOrder: Record<
    SavingsMovementKind,
    number
> = {
    deposit: 0,
    interestCapitalized: 1,
    interestCash: 2,
    withdrawal: 3,
};

export function summarizeSavings(
    plan: SavingsPlan,
    movements: readonly SavingsMovement[]
): SavingsSummary {

    if (!isValidSavingsPlan(plan)) {
        throw new Error(
            "Sổ tiết kiệm không hợp lệ."
        );
    }

    const seen = new Set<string>();

    const history = movements.filter(
        movement => movement.savingsId === plan.id
    );

    for (const movement of history) {
        if (
            !isValidSavingsMovement(movement) ||
            movement.date < plan.startDate ||
            seen.has(movement.id)
        ) {
            throw new Error(
                "Lịch sử tiết kiệm không hợp lệ."
            );
        }

        seen.add(movement.id);
    }

    history.sort(
        (a, b) =>
            a.date.localeCompare(b.date) ||
            movementOrder[a.kind] -
            movementOrder[b.kind] ||
            a.id.localeCompare(b.id)
    );

    let balanceMinor = plan.initialMinor;

    let depositedMinor = 0;
    let withdrawnMinor = 0;

    let interestCashMinor = 0;
    let interestCapitalizedMinor = 0;

    let closed = false;

    for (const movement of history) {

        const amount = movement.amountMinor;

        if (
            closed &&
            movement.kind !== "interestCash"
        ) {
            throw new Error(
                "Sổ tiết kiệm đã tất toán."
            );
        }

        switch (movement.kind) {

            case "deposit": {
                if (plan.kind === "fixed") {
                    throw new Error(
                        "Không gửi thêm vào sổ có kỳ hạn."
                    );
                }

                depositedMinor = safeAdd(
                    depositedMinor,
                    amount
                );

                balanceMinor = safeAdd(
                    balanceMinor,
                    amount
                );

                break;
            }

            case "withdrawal": {
                if (amount > balanceMinor) {
                    throw new Error(
                        "Số tiền rút vượt số dư tiết kiệm."
                    );
                }

                if (
                    plan.kind === "fixed" &&
                    amount !== balanceMinor
                ) {
                    throw new Error(
                        "Sổ có kỳ hạn phải tất toán toàn bộ."
                    );
                }

                withdrawnMinor = safeAdd(
                    withdrawnMinor,
                    amount
                );

                balanceMinor -= amount;

                if (
                    plan.kind === "fixed" &&
                    balanceMinor === 0
                ) {
                    closed = true;
                }

                break;
            }

            case "interestCash": {
                interestCashMinor = safeAdd(
                    interestCashMinor,
                    amount
                );

                break;
            }

            case "interestCapitalized": {
                if (
                    movement.accountId !== plan.accountId
                ) {
                    throw new Error(
                        "Tài khoản ghi nhận lãi không hợp lệ."
                    );
                }

                interestCapitalizedMinor = safeAdd(
                    interestCapitalizedMinor,
                    amount
                );

                balanceMinor = safeAdd(
                    balanceMinor,
                    amount
                );

                break;
            }
        }
    }

    return {
        initialMinor: plan.initialMinor,

        depositedMinor,
        withdrawnMinor,

        interestCashMinor,
        interestCapitalizedMinor,

        totalInterestMinor: safeAdd(
            interestCashMinor,
            interestCapitalizedMinor
        ),

        balanceMinor,

        status: closed ? "closed" : "active",
    };
}

export function savingsCashMovement(
    plan: SavingsPlan,
    accountId: string
): number {

    if (plan.accountId !== accountId) {
        return 0;
    }

    return -plan.initialMinor;
}

export function savingsMovementCash(
    plan: SavingsPlan,
    movement: SavingsMovement,
    accountId: string
): number {

    if (
        movement.savingsId !== plan.id ||
        movement.accountId !== accountId
    ) {
        return 0;
    }

    switch (movement.kind) {

        case "deposit":
            return -movement.amountMinor;

        case "withdrawal":
            return movement.amountMinor;

        case "interestCash":
            return movement.amountMinor;

        case "interestCapitalized":
            return 0;
    }
}

export function savingsNetValue(
    plan: SavingsPlan,
    movements: readonly SavingsMovement[]
): number {

    return summarizeSavings(
        plan,
        movements
    ).balanceMinor;
}