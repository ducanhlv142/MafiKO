import { describe, it, expect } from "vitest";

import { calculateBalance } from
    "../../src/domain/finance/balance.js";

import { toMovement } from
    "../../src/domain/finance/transaction.js";

import { createTransfer } from
    "../../src/domain/finance/transfer.js";

import { summarizeMonth } from
    "../../src/domain/finance/monthly-summary.js";

import { summarizeBudget } from
    "../../src/domain/finance/budget.js";

import { summarizeLoan } from
    "../../src/domain/finance/debt.js";

import {
    estimateLoanInterest,
    getLoanMaturity,
} from "../../src/domain/finance/loan-interest.js";

import {
    summarizeSavings,
    isValidSavingsPlan,
} from "../../src/domain/finance/savings.js";

import {
    getAccountBalance,
    getReportTransactions,
    getLoanNetValue,
    getSavingsNetValue,
} from "../../src/domain/finance/ledger.js";

import {
    makeFinanceFixture,
    TEST_DATE,
} from "../fixtures/finance.fixture";

describe("Balance Engine", () => {

    it("calculates opening balance and movements", () => {
        expect(
            calculateBalance(5000, [2000, -650])
        ).toBe(6350);
    });

    it("rejects invalid transaction amounts", () => {
        const data = makeFinanceFixture();

        expect(() => toMovement({
            ...data.transactions[0],
            amountMinor: -100,
        })).toThrow();
    });
});

describe("Transfer Engine", () => {

    it("preserves total assets during internal transfer", () => {
        const data = makeFinanceFixture();

        const source = data.accounts[0];

        const target = {
            ...source,
            id: "bank-jpy",
            kind: "bank" as const,
            openingBalanceMinor: 10000,
        };

        const transfer = createTransfer(
            source,
            target,
            2000,
            TEST_DATE,
            "Internal transfer"
        );

        data.transactions = [];
        data.transfers = [transfer];
        data.loans = [];
        data.loanPayments = [];
        data.savingsPlans = [];
        data.savingsMovements = [];

        const sourceBalance =
            getAccountBalance(source, data);

        const targetBalance =
            getAccountBalance(target, data);

        expect(sourceBalance).toBe(3000);
        expect(targetBalance).toBe(12000);

        expect(
            sourceBalance + targetBalance
        ).toBe(15000);
    });

    it("rejects cross-currency transfers", () => {
        const data = makeFinanceFixture();
        const source = data.accounts[0];

        expect(() => createTransfer(
            source,
            {
                ...source,
                id: "wallet-vnd",
                currency: "VND",
            },
            1000,
            TEST_DATE,
            ""
        )).toThrow();
    });
});

describe("Debt Engine", () => {

    it("calculates borrowed loan correctly", () => {
        const data = makeFinanceFixture();

        const summary = summarizeLoan(
            data.loans[0],
            data.loanPayments
        );

        expect(summary).toMatchObject({
            principalPaidMinor: 5000,
            remainingPrincipalMinor: 15000,
            interestPaidMinor: 300,
            feePaidMinor: 200,
            totalPaidMinor: 5500,
            status: "active",
        });
    });

    it("calculates outstanding receivable", () => {
        const data = makeFinanceFixture();

        expect(
            getLoanNetValue(
                data.loans[1],
                data.loanPayments
            )
        ).toBe(2000);
    });

    it("rejects principal overpayment", () => {
        const data = makeFinanceFixture();

        expect(() => summarizeLoan(
            data.loans[0],
            [{
                ...data.loanPayments[0],
                principalMinor: 20001,
            }]
        )).toThrow();
    });

    it("calculates estimated reducing-balance interest", () => {
        const data = makeFinanceFixture();

        const result = estimateLoanInterest(
            data.loans[0],
            data.loanPayments,
            "2026-12-26"
        );

        expect(
            result.estimatedInterestMinor
        ).toBe(62);

        expect(
            result.estimatedUnpaidInterestMinor
        ).toBe(0);
    });

    it("detects upcoming and overdue loans", () => {
        const data = makeFinanceFixture();

        expect(
            getLoanMaturity(
                data.loans[0],
                data.loanPayments,
                "2026-12-19"
            ).status
        ).toBe("dueSoon");

        expect(
            getLoanMaturity(
                data.loans[0],
                data.loanPayments,
                "2026-12-26"
            ).status
        ).toBe("dueToday");

        expect(
            getLoanMaturity(
                data.loans[0],
                data.loanPayments,
                "2026-12-27"
            ).status
        ).toBe("overdue");
    });
});

describe("Savings Engine", () => {

    it("calculates savings balance and interest", () => {
        const data = makeFinanceFixture();

        const summary = summarizeSavings(
            data.savingsPlans[0],
            data.savingsMovements
        );

        expect(summary).toMatchObject({
            depositedMinor: 1000,
            withdrawnMinor: 500,
            interestCashMinor: 100,
            interestCapitalizedMinor: 50,
            totalInterestMinor: 150,
            balanceMinor: 3550,
            status: "active",
        });
    });

    it("rejects withdrawals above savings balance", () => {
        const data = makeFinanceFixture();

        data.savingsMovements.push({
            ...data.savingsMovements[1],
            id: "invalid-withdrawal",
            amountMinor: 5000,
        });

        expect(() => summarizeSavings(
            data.savingsPlans[0],
            data.savingsMovements
        )).toThrow();
    });

    it("requires maturity date for fixed deposits", () => {
        const data = makeFinanceFixture();

        expect(isValidSavingsPlan({
            ...data.savingsPlans[0],
            kind: "fixed",
        })).toBe(false);
    });

    it("rejects partial withdrawal of fixed deposit", () => {
        const data = makeFinanceFixture();

        expect(() => summarizeSavings(
            {
                ...data.savingsPlans[0],
                kind: "fixed",
                maturityDate: "2026-12-26",
            },
            [data.savingsMovements[1]]
        )).toThrow();
    });
});

describe("Financial Ledger Regression", () => {

    it("calculates the correct wallet balance", () => {
        const data = makeFinanceFixture();

        expect(
            getAccountBalance(
                data.accounts[0],
                data
            )
        ).toBe(3598);
    });

    it("recognizes only actual income and expenses", () => {
        const data = makeFinanceFixture();

        const entries = getReportTransactions(data);

        const report = summarizeMonth(
            entries,
            "wallet-jpy",
            "2026-11"
        );

        expect(report.income).toBe(300);
        expect(report.expense).toBe(11152);
        expect(report.net).toBe(-10852);

        // Derived records must not modify raw data.
        expect(data.transactions).toHaveLength(2);
    });

    it("preserves correct net worth", () => {
        const data = makeFinanceFixture();

        const cash = getAccountBalance(
            data.accounts[0],
            data
        );

        const debt = data.loans.reduce(
            (sum, loan) =>
                sum + getLoanNetValue(
                    loan,
                    data.loanPayments
                ),
            0
        );

        const savings = getSavingsNetValue(
            data.savingsPlans[0],
            data.savingsMovements
        );

        expect(cash + debt + savings).toBe(-5852);
    });

    it("does not treat capitalized interest as cash", () => {
        const data = makeFinanceFixture();

        const before = getAccountBalance(
            data.accounts[0],
            data
        );

        data.savingsMovements =
            data.savingsMovements.filter(
                m => m.kind !== "interestCapitalized"
            );

        const after = getAccountBalance(
            data.accounts[0],
            data
        );

        expect(after).toBe(before);

        expect(
            getSavingsNetValue(
                data.savingsPlans[0],
                data.savingsMovements
            )
        ).toBe(3500);
    });

    it("preserves the credit-card debt convention", () => {
        const data = makeFinanceFixture();

        const card = {
            ...data.accounts[0],
            kind: "credit_card" as const,
            openingBalanceMinor: 1000,
        };

        data.transactions = [{
            ...data.transactions[0],
            amountMinor: 500,
        }];

        data.loans = [];
        data.loanPayments = [];
        data.savingsPlans = [];
        data.savingsMovements = [];

        expect(
            getAccountBalance(card, data)
        ).toBe(1500);
    });
});

describe("Budget Engine", () => {

    it("excludes savings transfers from spending", () => {
        const data = makeFinanceFixture();

        const result = summarizeBudget(
            data.budgets[0],
            data.accounts,
            getReportTransactions(data)
        );

        expect(result.spentMinor).toBe(652);
        expect(result.remainingMinor).toBe(4348);
        expect(result.status).toBe("normal");
    });
});