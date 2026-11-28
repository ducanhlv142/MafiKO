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
    addCustomCategory,
    updateCategoryDefinition,
} from "../../src/domain/finance/category-catalog.js";

import { createLedgerView } from
    "../../src/domain/finance/ledger-view.js";

import type { Transaction } from
    "../../src/domain/finance/transaction";

import {
    makeFinanceFixture,
    TEST_DATE,
} from "../fixtures/finance.fixture";

let db: IDBDatabase;

let finance: FinanceService;

let customId: string;

let archivedId: string;

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

    // Test-only: seed a prepared catalog directly.
    // Production JSON import remains gated.

    await restoreBackup(
        db,
        fixture
    );
});

afterEach(() => {

    db?.close();

    vi.unstubAllGlobals();
});

function makeEntry(
    categoryId: string
): Transaction {

    return {

        id: crypto.randomUUID(),

        accountId: "wallet-jpy",

        kind: "expense",

        amountMinor: 500,

        date: TEST_DATE,

        note: "Category test",

        categoryId,
    };
}

describe("Dynamic Transaction Categories", () => {

    it("creates transactions with custom categories", async () => {

        const entry = makeEntry(customId);

        await finance.createTransaction(
            entry,
            "JPY",
            TEST_DATE
        );

        const snapshot =
            await finance.getFinanceSnapshot();

        expect(snapshot.transactions)
            .toContainEqual(entry);

        expect(
            createLedgerView(snapshot)
                .getAccountBalance("wallet-jpy")
        ).toBe(3098);
    });

    it("rejects archived categories for new transactions", async () => {

        await expect(
            finance.createTransaction(
                makeEntry(archivedId),
                "JPY",
                TEST_DATE
            )
        ).rejects.toMatchObject({
            code: "CATEGORY_ARCHIVED",
        });

        const snapshot =
            await finance.getFinanceSnapshot();

        expect(snapshot.transactions)
            .toHaveLength(2);
    });

    it("rejects unknown custom category IDs", async () => {

        const missingId =
            `custom-${crypto.randomUUID()}`;

        await expect(
            finance.createTransaction(
                makeEntry(missingId),
                "JPY",
                TEST_DATE
            )
        ).rejects.toMatchObject({
            code: "CATEGORY_NOT_FOUND",
        });
    });

    it("rejects categories of another transaction kind", async () => {

        const entry: Transaction = {

            ...makeEntry(customId),

            kind: "income",
        };

        await expect(
            finance.createTransaction(
                entry,
                "JPY",
                TEST_DATE
            )
        ).rejects.toMatchObject({
            code: "INVALID_CATEGORY",
        });
    });

    it("changes existing transactions to custom categories", async () => {

        const before =
            await finance.getFinanceSnapshot();

        const entry =
            before.transactions[0];

        await finance.changeCategory(
            entry,
            customId
        );

        const after =
            await finance.getFinanceSnapshot();

        expect(
            after.transactions.find(
                t => t.id === entry.id
            )?.categoryId
        ).toBe(customId);

        expect(
            createLedgerView(after)
                .getAccountBalance("wallet-jpy")
        ).toBe(3598);
    });

    it("rejects changes to archived categories", async () => {

        const before =
            await finance.getFinanceSnapshot();

        await expect(
            finance.changeCategory(
                before.transactions[0],
                archivedId
            )
        ).rejects.toMatchObject({
            code: "CATEGORY_ARCHIVED",
        });

        const after =
            await finance.getFinanceSnapshot();

        expect(after.transactions)
            .toEqual(before.transactions);
    });

    it("allows editing historical archived transactions", async () => {

        const snapshot =
            await finance.getFinanceSnapshot();

        const entry =
            snapshot.transactions[0];

        entry.categoryId = archivedId;

        const fixture = {

            ...makeFinanceFixture(),

            ...snapshot,
        };

        await restoreBackup(
            db,
            fixture
        );

        const stored =
            await finance.getFinanceSnapshot();

        const original =
            stored.transactions.find(
                t => t.id === entry.id
            )!;

        await finance.updateTransaction(
            original,
            {

                kind: original.kind,

                amountMinor: 1000,

                categoryId:
                    original.categoryId,

                date: original.date,

                note: original.note,
            },
            TEST_DATE
        );

        const after =
            await finance.getFinanceSnapshot();

        expect(
            after.transactions.find(
                t => t.id === original.id
            )?.categoryId
        ).toBe(archivedId);

        expect(
            createLedgerView(after)
                .getAccountBalance("wallet-jpy")
        ).toBe(3250);
    });

    it("rejects orphan category references in ledger snapshots", async () => {

        const snapshot =
            await finance.getFinanceSnapshot();

        snapshot.transactions[0].categoryId =
            `custom-${crypto.randomUUID()}`;

        expect(() =>
            createLedgerView(snapshot)
        ).toThrow(
            "Không tìm thấy danh mục."
        );
    });
});