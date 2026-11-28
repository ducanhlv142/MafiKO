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

import { restoreBackup } from
    "../../src/storage/restore.js";

import { FinanceService } from
    "../../src/application/services/finance-service.js";

import { IndexedDbFinanceRepository } from
    "../../src/infrastructure/indexeddb/finance-repository.js";

import {
    createBudget,
    summarizeBudget,
} from "../../src/domain/finance/budget.js";

import {
    addCustomCategory,
    updateCategoryDefinition,
    createCategoryCatalog,
} from "../../src/domain/finance/category-catalog.js";

import { createLedgerView } from
    "../../src/domain/finance/ledger-view.js";

import {
    makeFinanceFixture,
    TEST_DATE,
} from "../fixtures/finance.fixture";

let db: IDBDatabase;

let finance: FinanceService;

let customId: string;

let archivedId: string;

let incomeId: string;

beforeEach(async () => {

    vi.stubGlobal(
        "indexedDB",
        new IDBFactory()
    );

    db = await openDatabase();

    finance = new FinanceService(
        new IndexedDbFinanceRepository(db)
    );

    const fixture = makeFinanceFixture();

    fixture.categories = addCustomCategory(
        fixture.categories,
        "expense",
        "Cà phê",
        "food"
    );

    customId = fixture.categories[
        fixture.categories.length - 1
    ].id;

    fixture.categories = addCustomCategory(
        fixture.categories,
        "expense",
        "Giải trí"
    );

    archivedId = fixture.categories[
        fixture.categories.length - 1
    ].id;

    fixture.categories =
        updateCategoryDefinition(
            fixture.categories,
            archivedId,
            {
                name: "Giải trí",
                archived: true,
            }
        );

    fixture.categories = addCustomCategory(
        fixture.categories,
        "income",
        "Freelance"
    );

    incomeId = fixture.categories[
        fixture.categories.length - 1
    ].id;

    await restoreBackup(
        db,
        fixture
    );
});

afterEach(() => {

    db?.close();

    vi.unstubAllGlobals();
});

describe("Dynamic Budget Categories", () => {

    it("creates budgets for custom categories", async () => {

        const budget = createBudget(
            "2026-11",
            "JPY",
            customId,
            5000
        );

        await finance.saveBudget(budget);

        const snapshot =
            await finance.getFinanceSnapshot();

        expect(snapshot.budgets)
            .toContainEqual(budget);
    });

    it("rejects budgets for archived categories", async () => {

        const budget = createBudget(
            "2026-11",
            "JPY",
            archivedId,
            5000
        );

        await expect(
            finance.saveBudget(budget)
        ).rejects.toMatchObject({
            code: "CATEGORY_ARCHIVED",
        });

        const snapshot =
            await finance.getFinanceSnapshot();

        expect(snapshot.budgets)
            .toHaveLength(1);
    });

    it("rejects missing category references", async () => {

        const budget = createBudget(
            "2026-11",
            "JPY",
            `custom-${crypto.randomUUID()}`,
            5000
        );

        await expect(
            finance.saveBudget(budget)
        ).rejects.toMatchObject({
            code: "CATEGORY_NOT_FOUND",
        });
    });

    it("rejects income categories in expense budgets", async () => {

        const budget = createBudget(
            "2026-11",
            "JPY",
            incomeId,
            5000
        );

        await expect(
            finance.saveBudget(budget)
        ).rejects.toMatchObject({
            code: "INVALID_CATEGORY",
        });
    });

    it("calculates spending for custom categories", async () => {

        const budget = createBudget(
            "2026-11",
            "JPY",
            customId,
            5000
        );

        await finance.saveBudget(budget);

        await finance.createTransaction(
            {
                id: "custom-expense",

                accountId: "wallet-jpy",

                kind: "expense",

                categoryId: customId,

                amountMinor: 4000,

                date: TEST_DATE,

                note: "Coffee",
            },
            "JPY",
            TEST_DATE
        );

        const snapshot =
            await finance.getFinanceSnapshot();

        const report =
            createLedgerView(snapshot)
                .getReportTransactions();

        const summary = summarizeBudget(
            budget,
            snapshot.accounts,
            report
        );

        expect(summary.spentMinor)
            .toBe(4000);

        expect(summary.remainingMinor)
            .toBe(1000);

        expect(summary.usagePercent)
            .toBe(80);

        expect(summary.status)
            .toBe("warning");
    });

    it("does not double count child category spending", async () => {

        await finance.createTransaction(
            {
                id: "child-expense",

                accountId: "wallet-jpy",

                kind: "expense",

                categoryId: customId,

                amountMinor: 500,

                date: TEST_DATE,

                note: "Coffee",
            },
            "JPY",
            TEST_DATE
        );

        const snapshot =
            await finance.getFinanceSnapshot();

        const report =
            createLedgerView(snapshot)
                .getReportTransactions();

        const parent = snapshot.budgets[0];

        const child = createBudget(
            "2026-11",
            "JPY",
            customId,
            1000
        );

        const parentSummary = summarizeBudget(
            parent,
            snapshot.accounts,
            report
        );

        const childSummary = summarizeBudget(
            child,
            snapshot.accounts,
            report
        );

        expect(parentSummary.spentMinor)
            .toBe(652);

        expect(childSummary.spentMinor)
            .toBe(500);

        expect(
            parentSummary.spentMinor +
            childSummary.spentMinor
        ).toBe(1152);
    });

    it("allows updating existing archived budgets", async () => {

        const snapshot =
            await finance.getFinanceSnapshot();

        const original = createBudget(
            "2026-11",
            "JPY",
            archivedId,
            1000
        );

        // Seed historical data in the test database.

        await restoreBackup(
            db,
            {
                ...makeFinanceFixture(),
                ...snapshot,
                budgets: [
                    ...snapshot.budgets,
                    original,
                ],
            }
        );

        const next = {
            ...original,

            limitMinor: 2000,
        };

        await finance.saveBudget(
            next,
            original
        );

        const current =
            await finance.getFinanceSnapshot();

        expect(current.budgets)
            .toContainEqual(next);

        await finance.deleteBudget(next);

        const afterDelete =
            await finance.getFinanceSnapshot();

        expect(afterDelete.budgets)
            .not.toContainEqual(next);
    });

    it("preserves financial values when categories are renamed", async () => {

        const before =
            await finance.getFinanceSnapshot();

        const reportBefore =
            createLedgerView(before)
                .getReportTransactions();

        const renamed =
            updateCategoryDefinition(
                before.categories,
                "food",
                {
                    name: "Ẩm thực",
                    archived: false,
                }
            );

        const after = {
            ...before,

            categories: renamed,
        };

        const catalog =
            createCategoryCatalog(
                after.categories
            );

        const reportAfter =
            createLedgerView(after)
                .getReportTransactions();

        expect(
            catalog.getLabel("food")
        ).toBe("Ẩm thực");

        expect(reportAfter)
            .toEqual(reportBefore);

        const summary = summarizeBudget(
            after.budgets[0],
            after.accounts,
            reportAfter
        );

        expect(summary.spentMinor)
            .toBe(652);
    });
});