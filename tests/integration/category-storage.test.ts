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

import {
    createBackup,
    FINANCE_STORES,
} from "../../src/storage/backup.js";

import {
    parseBackup,
    restoreBackup,
} from "../../src/storage/restore.js";

import { FinanceService } from
    "../../src/application/services/finance-service.js";

import { IndexedDbFinanceRepository } from
    "../../src/infrastructure/indexeddb/finance-repository.js";

import { addCustomCategory } from
    "../../src/domain/finance/category-catalog.js";

import { buildFinanceOverview } from
    "../../src/domain/finance/finance-overview.js";

import { makeFinanceFixture } from
    "../fixtures/finance.fixture";

let db: IDBDatabase | undefined;

beforeEach(() => {

    vi.stubGlobal(
        "indexedDB",
        new IDBFactory()
    );
});

afterEach(() => {

    db?.close();

    db = undefined;

    vi.unstubAllGlobals();
});

describe("Category Persistence", () => {

    it("seeds eleven categories in a new database", async () => {

        db = await openDatabase();

        const finance = new FinanceService(
            new IndexedDbFinanceRepository(db)
        );

        const categories =
            await finance.listCategories();

        expect(categories).toEqual(
            makeFinanceFixture().categories
        );

        expect(categories).toHaveLength(11);

        const snapshot =
            await finance.getFinanceSnapshot();

        expect(snapshot.categories)
            .toEqual(categories);
    });

    it("upgrades version six without losing financial records", async () => {

        const fixture = makeFinanceFixture();

        const oldStores = FINANCE_STORES.filter(
            name => name !== "categories"
        );

        const oldDb = await new Promise<IDBDatabase>(
            (resolve, reject) => {

                const request =
                    indexedDB.open("mafiko", 6);

                request.onupgradeneeded = () => {

                    const database = request.result;

                    for (const name of oldStores) {

                        const store =
                            database.createObjectStore(
                                name,
                                { keyPath: "id" }
                            );

                        for (const record of fixture[name]) {

                            store.add(record);
                        }
                    }
                };

                request.onsuccess = () =>
                    resolve(request.result);

                request.onerror = () =>
                    reject(request.error);
            }
        );

        oldDb.close();

        db = await openDatabase();

        expect(db.version).toBe(7);

        const current =
            await createBackup(db);

        for (const name of FINANCE_STORES) {

            expect(current[name])
                .toEqual(fixture[name]);
        }

        expect(
            buildFinanceOverview(current)
                .currencyTotals[0]
                .netWorthMinor
        ).toBe(-5852);
    });

    it("migrates a complete version four backup", async () => {

        db = await openDatabase();

        const fixture =
            makeFinanceFixture();

        const {
            categories,
            ...records
        } = fixture;

        const legacy = {

            ...records,

            formatVersion: 4,
        };

        const migrated = parseBackup(
            JSON.stringify(legacy)
        );

        expect(migrated.formatVersion)
            .toBe(5);

        expect(migrated.categories)
            .toHaveLength(11);

        await restoreBackup(
            db,
            migrated
        );

        const current = await createBackup(db);

        for (const name of FINANCE_STORES) {

            expect(current[name])
                .toEqual(fixture[name]);
        }
    });

    it("rejects version five backups missing system categories", () => {

        const fixture = makeFinanceFixture();

        fixture.categories =
            fixture.categories.filter(
                category =>
                    category.id !== "loanCost"
            );

        expect(() =>
            parseBackup(
                JSON.stringify(fixture)
            )
        ).toThrow();
    });

    it("blocks custom catalog activation before financial integration", () => {

        const fixture = makeFinanceFixture();

        fixture.categories = addCustomCategory(
            fixture.categories,
            "expense",
            "Cà phê",
            "food"
        );

        expect(() =>
            parseBackup(
                JSON.stringify(fixture)
            )
        ).toThrow(
            "Danh mục tùy chỉnh chưa được hỗ trợ"
        );
    });
});