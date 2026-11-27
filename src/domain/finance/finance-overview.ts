import type { Account } from "./account";

import type { Transaction } from "./transaction";

import type { Loan } from "./debt";

import type { SavingsPlan } from "./savings";

import type { LedgerSnapshot } from "./ledger-view";

import { createLedgerView } from "./ledger-view.js";

import {
    getLoanNetValue,
    getSavingsNetValue,
} from "./ledger.js";

import { sumMinor } from "./money.js";

import { DomainError } from "./errors.js";

interface PositionValue {

    currency: Account["currency"];

    balanceMinor: number;

    netMinor: number;
}

export type FinancePosition =
    PositionValue & (
        | {
            kind: "account";
            record: Account;
        }
        | {
            kind: "loan";
            record: Loan;
        }
        | {
            kind: "savings";
            record: SavingsPlan;
        }
    );

export interface CurrencyNetWorth {

    currency: Account["currency"];

    assetsMinor: number;

    liabilitiesMinor: number;

    netWorthMinor: number;
}

export interface FinanceOverview {

    positions: FinancePosition[];

    currencyTotals: CurrencyNetWorth[];

    reportTransactions: Transaction[];
}

export function buildFinanceOverview(
    snapshot: LedgerSnapshot
): FinanceOverview {

    const view = createLedgerView(snapshot);

    const positions: FinancePosition[] = [];

    // ====================================
    // 1. ACCOUNT POSITIONS
    // ====================================

    for (const account of snapshot.accounts) {

        const balance = view.getAccountBalance(
            account.id
        );

        positions.push({
            kind: "account",

            record: { ...account },

            currency: account.currency,

            balanceMinor: balance,

            netMinor:
                account.kind === "credit_card"
                    ? -balance
                    : balance,
        });
    }

    // ====================================
    // 2. DEBT POSITIONS
    // ====================================

    for (const loan of snapshot.loans) {

        const net = view.getPositionNet(
            "loan",
            loan.id
        );

        const expected = getLoanNetValue(
            loan,
            snapshot.loanPayments
        );

        if (net !== expected) {

            throw new DomainError(
                "LEDGER_POSITION_MISMATCH"
            );
        }

        positions.push({
            kind: "loan",

            record: { ...loan },

            currency: loan.currency,

            balanceMinor: Math.abs(net),

            netMinor: net,
        });
    }

    // ====================================
    // 3. SAVINGS POSITIONS
    // ====================================

    for (const plan of snapshot.savingsPlans) {

        const net = view.getPositionNet(
            "savings",
            plan.id
        );

        const expected = getSavingsNetValue(
            plan,
            snapshot.savingsMovements
        );

        if (net !== expected) {

            throw new DomainError(
                "LEDGER_POSITION_MISMATCH"
            );
        }

        positions.push({
            kind: "savings",

            record: { ...plan },

            currency: plan.currency,

            balanceMinor: net,

            netMinor: net,
        });
    }

    // ====================================
    // 4. MULTI-CURRENCY NET WORTH
    // ====================================

    const grouped = new Map<
        Account["currency"],
        number[]
    >();

    for (const position of positions) {

        let amounts = grouped.get(
            position.currency
        );

        if (!amounts) {

            amounts = [];

            grouped.set(
                position.currency,
                amounts
            );
        }

        amounts.push(position.netMinor);
    }

    const currencyTotals: CurrencyNetWorth[] = [];

    for (const [currency, amounts] of grouped) {

        const assets = sumMinor(
            amounts.filter(value => value > 0)
        );

        const liabilities = sumMinor(
            amounts
                .filter(value => value < 0)
                .map(value => -value)
        );

        currencyTotals.push({

            currency,

            assetsMinor: assets,

            liabilitiesMinor: liabilities,

            netWorthMinor: sumMinor(amounts),
        });
    }

    return {

        positions,

        currencyTotals,

        reportTransactions:
            view.getReportTransactions(),
    };
}