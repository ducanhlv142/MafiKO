import {
    describe,
    it,
    expect,
    beforeEach,
    afterEach,
    vi,
} from "vitest";

import { IDBFactory } from
    "fake-indexeddb";

import { openDatabase } from
    "../../src/storage/database.js";

import { createBackup } from
    "../../src/storage/backup.js";

import { restoreBackup } from
    "../../src/storage/restore.js";

import { FinanceService } from
    "../../src/application/services/finance-service.js";

import { IndexedDbFinanceRepository } from
    "../../src/infrastructure/indexeddb/finance-repository.js";

import {
    getAccountBalance,
    getReportTransactions,
} from "../../src/domain/finance/ledger.js";

import {
    makeFinanceFixture,
    TEST_DATE,
} from "../fixtures/finance.fixture";

let db: IDBDatabase;

let finance: FinanceService;

beforeEach(async () => {

    vi.stubGlobal(
        "indexedDB",
        new IDBFactory()
    );

    db = await openDatabase();

    finance = new FinanceService(
        new IndexedDbFinanceRepository(db)
    );

    await restoreBackup(
        db,
        makeFinanceFixture()
    );
});

afterEach(() => {

    db?.close();

    vi.unstubAllGlobals();
});

describe("Finance Queries", () => {

    it("returns all financial records", async () => {

        const data = makeFinanceFixture();

        const {
            app,
            formatVersion,
            exportedAt,
            ...expected
        } = data;

        const snapshot =
            await finance.getFinanceSnapshot();

        expect(snapshot).toEqual(expected);
    });

    it("does not expose backup metadata in queries", async () => {

        const snapshot =
            await finance.getFinanceSnapshot();

        expect(snapshot)
            .not.toHaveProperty("app");

        expect(snapshot)
            .not.toHaveProperty("formatVersion");

        expect(snapshot)
            .not.toHaveProperty("exportedAt");
    });

    it("returns a debt-specific snapshot", async () => {

        const data = makeFinanceFixture();

        const snapshot =
            await finance.getDebtSnapshot();

        expect(snapshot).toEqual({
            accounts: data.accounts,
            loans: data.loans,
            loanPayments: data.loanPayments,
        });

        expect(snapshot)
            .not.toHaveProperty("transactions");

        expect(snapshot)
            .not.toHaveProperty("budgets");

        expect(snapshot)
            .not.toHaveProperty("savingsPlans");
    });

    it("only reads the required debt stores", async () => {

        const spy =
            vi.spyOn(db, "transaction");

        try {

            await finance.getDebtSnapshot();

            expect(spy).toHaveBeenCalledWith(
                [
                    "accounts",
                    "loans",
                    "loanPayments",
                ],
                "readonly"
            );

            expect(spy).toHaveBeenCalledTimes(1);

        } finally {

            spy.mockRestore();
        }
    });

    it("preserves existing financial calculations", async () => {

        const snapshot =
            await finance.getFinanceSnapshot();

        expect(
            getAccountBalance(
                snapshot.accounts[0],
                snapshot
            )
        ).toBe(3598);

        const report =
            getReportTransactions(snapshot);

        const income = report
            .filter(t => t.kind === "income")
            .reduce(
                (sum, t) =>
                    sum + t.amountMinor,
                0
            );

        expect(income).toBe(300);
    });

    it("returns fresh data after commands", async () => {

        const before =
            await finance.getFinanceSnapshot();

        const account =
            before.accounts[0];

        await finance.createTransaction(
            {
                id: "query-test-income",
                accountId: account.id,
                kind: "income",
                categoryId: "salary",
                amountMinor: 500,
                date: TEST_DATE,
                note: "Query test",
            },
            account.currency,
            TEST_DATE
        );

        const after =
            await finance.getFinanceSnapshot();

        expect(after.transactions.length)
            .toBe(before.transactions.length + 1);

        expect(
            getAccountBalance(account, after)
        ).toBe(4098);
    });

    it("does not persist changes to returned snapshots", async () => {

        const snapshot =
            await finance.getFinanceSnapshot();

        snapshot.accounts[0].name =
            "Modified outside database";

        snapshot.transactions.length = 0;

        const current =
            await finance.getFinanceSnapshot();

        expect(current.accounts[0].name)
            .toBe("Test Wallet");

        expect(current.transactions)
            .toHaveLength(2);
    });

    it("exports backup version five", async () => {

        const snapshot =
            await finance.getFinanceSnapshot();

        const backup =
            await createBackup(db);

        const {
            app,
            formatVersion,
            exportedAt,
            ...records
        } = backup;

        expect(app).toBe("MafiKO");

        expect(formatVersion).toBe(5);

        expect(
            Number.isFinite(
                Date.parse(exportedAt)
            )
        ).toBe(true);

        expect(records).toEqual(snapshot);
    });
});