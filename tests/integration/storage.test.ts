import {
    beforeEach,
    afterEach,
    describe,
    it,
    expect,
    vi,
} from "vitest";

import { IDBFactory } from "fake-indexeddb";

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

import {
    makeFinanceFixture,
} from "../fixtures/finance.fixture";

let db: IDBDatabase | undefined;

beforeEach(() => {

    // A completely isolated database for every test.
    vi.stubGlobal("indexedDB", new IDBFactory());
});

afterEach(() => {

    db?.close();
    db = undefined;

    vi.unstubAllGlobals();
});

describe("IndexedDB Database", () => {

    it("creates all eight object stores", async () => {
        db = await openDatabase();

        expect(db.version).toBe(6);

        expect(
            Array.from(db.objectStoreNames).sort()
        ).toEqual(
            [...FINANCE_STORES].sort()
        );

        expect(db.objectStoreNames.length).toBe(8);
    });

    it("upgrades v5 to v6 without deleting accounts", async () => {

        const fixture = makeFinanceFixture();

        const oldDb = await new Promise<IDBDatabase>(
            (resolve, reject) => {

                const request =
                    indexedDB.open("mafiko", 5);

                request.onupgradeneeded = () => {

                    const database = request.result;

                    const accounts =
                        database.createObjectStore(
                            "accounts",
                            { keyPath: "id" }
                        );

                    accounts.add(fixture.accounts[0]);

                    database.createObjectStore(
                        "transactions",
                        { keyPath: "id" }
                    ).createIndex("byAccount", "accountId");

                    const transfers =
                        database.createObjectStore(
                            "transfers",
                            { keyPath: "id" }
                        );

                    transfers.createIndex(
                        "bySource", "fromAccountId"
                    );

                    transfers.createIndex(
                        "byDestination", "toAccountId"
                    );

                    database.createObjectStore(
                        "budgets",
                        { keyPath: "id" }
                    ).createIndex(
                        "byMonthCurrency",
                        ["month", "currency"]
                    );

                    const loans =
                        database.createObjectStore(
                            "loans",
                            { keyPath: "id" }
                        );

                    loans.createIndex("byAccount", "accountId");
                    loans.createIndex("byDirection", "direction");
                    loans.createIndex("byCurrency", "currency");
                    loans.createIndex("byDueDate", "dueDate");

                    const payments =
                        database.createObjectStore(
                            "loanPayments",
                            { keyPath: "id" }
                        );

                    payments.createIndex("byLoan", "loanId");
                    payments.createIndex("byAccount", "accountId");
                    payments.createIndex("byDate", "date");
                };

                request.onsuccess = () =>
                    resolve(request.result);

                request.onerror = () =>
                    reject(request.error);
            }
        );

        oldDb.close();

        db = await openDatabase();

        const backup = await createBackup(db);

        expect(db.version).toBe(6);
        expect(backup.accounts).toEqual(fixture.accounts);
        expect(backup.savingsPlans).toEqual([]);
        expect(backup.savingsMovements).toEqual([]);
    });

    it("restores and exports all financial records", async () => {
        db = await openDatabase();

        const fixture = makeFinanceFixture();

        const validated = parseBackup(
            JSON.stringify(fixture)
        );

        await restoreBackup(db, validated);

        const exported = await createBackup(db);

        expect(exported.formatVersion).toBe(4);

        for (const store of FINANCE_STORES) {
            expect(exported[store]).toEqual(fixture[store]);
        }
    });

    it("rolls back a failed restore atomically", async () => {
        db = await openDatabase();

        const original = makeFinanceFixture();

        await restoreBackup(db, original);

        const invalid = makeFinanceFixture();

        invalid.accounts.push({
            ...invalid.accounts[0],
        });

        // Intentionally bypass parseBackup to test
        // rollback at database level.
        await expect(
            restoreBackup(db, invalid)
        ).rejects.toBeDefined();

        const current = await createBackup(db);

        for (const store of FINANCE_STORES) {
            expect(current[store]).toEqual(original[store]);
        }
    });
});

describe("Backup Compatibility", () => {

    it.each([1, 2, 3])(
        "upgrades backup version %i",
        (version) => {

            const fixture = makeFinanceFixture();

            const legacy = {
                app: "MafiKO",
                exportedAt: fixture.exportedAt,
                formatVersion: version,
                accounts: fixture.accounts,
                transactions: fixture.transactions,
                transfers: fixture.transfers,

                ...(version >= 2
                    ? { budgets: fixture.budgets }
                    : {}),

                ...(version >= 3
                    ? {
                        loans: fixture.loans,
                        loanPayments: fixture.loanPayments,
                    }
                    : {}),
            };

            const parsed = parseBackup(
                JSON.stringify(legacy)
            );

            expect(parsed.formatVersion).toBe(4);

            expect(parsed.accounts).toEqual(fixture.accounts);
            expect(parsed.transactions).toEqual(fixture.transactions);
            expect(parsed.transfers).toEqual(fixture.transfers);

            expect(parsed.budgets).toEqual(
                version >= 2 ? fixture.budgets : []
            );

            expect(parsed.loans).toEqual(
                version >= 3 ? fixture.loans : []
            );

            expect(parsed.loanPayments).toEqual(
                version >= 3 ? fixture.loanPayments : []
            );

            expect(parsed.savingsPlans).toEqual([]);
            expect(parsed.savingsMovements).toEqual([]);
        }
    );

    it("rejects duplicate account IDs", () => {
        const fixture = makeFinanceFixture();

        fixture.accounts.push({
            ...fixture.accounts[0],
        });

        expect(() => parseBackup(
            JSON.stringify(fixture)
        )).toThrow();
    });

    it("rejects orphan savings movements", () => {
        const fixture = makeFinanceFixture();

        fixture.savingsMovements[0].savingsId =
            "missing-savings";

        expect(() => parseBackup(
            JSON.stringify(fixture)
        )).toThrow();
    });

    it("rejects currency mismatches", () => {
        const fixture = makeFinanceFixture();

        fixture.savingsPlans[0].currency = "VND";

        expect(() => parseBackup(
            JSON.stringify(fixture)
        )).toThrow();
    });

    it("rejects invalid savings history", () => {
        const fixture = makeFinanceFixture();

        fixture.savingsMovements[1].amountMinor =
            100000;

        expect(() => parseBackup(
            JSON.stringify(fixture)
        )).toThrow();
    });
});