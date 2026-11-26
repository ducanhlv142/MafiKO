import type { FinanceBackup } from "../../src/storage/backup";

export const TEST_DATE = "2026-11-26";

export function makeFinanceFixture(): FinanceBackup {
    return {
        app: "MafiKO",
        formatVersion: 4,
        exportedAt: "2026-11-26T08:00:00.000Z",

        accounts: [
            {
                id: "wallet-jpy",
                name: "Test Wallet",
                kind: "cash",
                currency: "JPY",
                openingBalanceMinor: 5000,
                openingBalanceDate: TEST_DATE,
            },
        ],

        transactions: [
            {
                id: "tx-food",
                accountId: "wallet-jpy",
                kind: "expense",
                categoryId: "food",
                amountMinor: 652,
                date: TEST_DATE,
                note: "Lunch",
            },
            {
                id: "tx-transport",
                accountId: "wallet-jpy",
                kind: "expense",
                categoryId: "transport",
                amountMinor: 10000,
                date: TEST_DATE,
                note: "Transport",
            },
        ],

        transfers: [],

        budgets: [
            {
                id: "2026-11:JPY:food",
                month: "2026-11",
                currency: "JPY",
                categoryId: "food",
                limitMinor: 5000,
            },
        ],

        loans: [
            {
                id: "loan-borrowed",
                direction: "borrowed",
                counterparty: "Borrowed loan",
                accountId: "wallet-jpy",
                currency: "JPY",
                principalMinor: 20000,
                annualRateBps: 500,
                startDate: TEST_DATE,
                dueDate: "2026-12-26",
                note: "",
            },
            {
                id: "loan-lent",
                direction: "lent",
                counterparty: "Lent loan",
                accountId: "wallet-jpy",
                currency: "JPY",
                principalMinor: 3000,
                annualRateBps: 500,
                startDate: TEST_DATE,
                dueDate: "2026-12-26",
                note: "",
            },
        ],

        loanPayments: [
            {
                id: "payment-1",
                loanId: "loan-borrowed",
                accountId: "wallet-jpy",
                principalMinor: 5000,
                interestMinor: 300,
                feeMinor: 200,
                date: TEST_DATE,
                note: "",
            },
            {
                id: "payment-2",
                loanId: "loan-lent",
                accountId: "wallet-jpy",
                principalMinor: 1000,
                interestMinor: 100,
                feeMinor: 50,
                date: TEST_DATE,
                note: "",
            },
        ],

        savingsPlans: [
            {
                id: "saving-1",
                name: "Test Savings",
                kind: "flexible",
                accountId: "wallet-jpy",
                currency: "JPY",
                initialMinor: 3000,
                annualRateBps: 300,
                interestMethod: "simple",
                startDate: TEST_DATE,
                note: "",
            },
        ],

        savingsMovements: [
            {
                id: "movement-1",
                savingsId: "saving-1",
                accountId: "wallet-jpy",
                kind: "deposit",
                amountMinor: 1000,
                date: TEST_DATE,
                note: "",
            },
            {
                id: "movement-2",
                savingsId: "saving-1",
                accountId: "wallet-jpy",
                kind: "withdrawal",
                amountMinor: 500,
                date: TEST_DATE,
                note: "",
            },
            {
                id: "movement-3",
                savingsId: "saving-1",
                accountId: "wallet-jpy",
                kind: "interestCash",
                amountMinor: 100,
                date: TEST_DATE,
                note: "",
            },
            {
                id: "movement-4",
                savingsId: "saving-1",
                accountId: "wallet-jpy",
                kind: "interestCapitalized",
                amountMinor: 50,
                date: TEST_DATE,
                note: "",
            },
        ],
    };
}