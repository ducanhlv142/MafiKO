import {
    describe,
    it,
    expect,
    beforeEach,
    afterEach,
    vi,
} from "vitest";

import { IDBFactory } from "fake-indexeddb";

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

import { createTransfer } from
    "../../src/domain/finance/transfer.js";

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
});

afterEach(() => {

    db?.close();

    vi.unstubAllGlobals();
});

describe("Finance Repository", () => {

    it("creates and reads accounts", async () => {

        const account =
            makeFinanceFixture().accounts[0];

        await finance.createAccount(
            account,
            TEST_DATE
        );

        expect(
            await finance.listAccounts()
        ).toEqual([account]);
    });

    it("rejects duplicate accounts", async () => {

        const account =
            makeFinanceFixture().accounts[0];

        await finance.createAccount(
            account,
            TEST_DATE
        );

        await expect(
            finance.createAccount(
                account,
                TEST_DATE
            )
        ).rejects.toMatchObject({
            code: "RECORD_CONFLICT",
        });

        expect(
            await finance.listAccounts()
        ).toHaveLength(1);
    });

    it("creates valid financial transactions", async () => {

        const data = makeFinanceFixture();

        await finance.createAccount(
            data.accounts[0],
            TEST_DATE
        );

        await finance.createTransaction(
            data.transactions[0],
            "JPY",
            TEST_DATE
        );

        const backup = await createBackup(db);

        expect(backup.transactions)
            .toEqual([data.transactions[0]]);
    });

    it("rejects orphan transactions", async () => {

        const data = makeFinanceFixture();

        await expect(
            finance.createTransaction(
                data.transactions[0],
                "JPY",
                TEST_DATE
            )
        ).rejects.toMatchObject({
            code: "ACCOUNT_NOT_FOUND",
        });

        const backup = await createBackup(db);

        expect(backup.transactions).toEqual([]);
    });

    it("rejects transactions before account opening", async () => {

        const data = makeFinanceFixture();

        await finance.createAccount(
            data.accounts[0],
            TEST_DATE
        );

        await expect(
            finance.createTransaction(
                {
                    ...data.transactions[0],
                    date: "2026-11-25",
                },
                "JPY",
                TEST_DATE
            )
        ).rejects.toMatchObject({
            code: "INVALID_DATE",
        });
    });

    it("rejects future transactions", async () => {

        const data = makeFinanceFixture();

        await finance.createAccount(
            data.accounts[0],
            TEST_DATE
        );

        await expect(
            finance.createTransaction(
                {
                    ...data.transactions[0],
                    date: "2026-11-27",
                },
                "JPY",
                TEST_DATE
            )
        ).rejects.toMatchObject({
            code: "INVALID_DATE",
        });
    });

    it("rejects stale account currencies", async () => {

        const data = makeFinanceFixture();

        await finance.createAccount(
            {
                ...data.accounts[0],
                currency: "VND",
            },
            TEST_DATE
        );

        await expect(
            finance.createTransaction(
                data.transactions[0],
                "JPY",
                TEST_DATE
            )
        ).rejects.toMatchObject({
            code: "CURRENCY_MISMATCH",
        });

        const backup = await createBackup(db);

        expect(backup.transactions).toEqual([]);
    });

    it("creates valid internal transfers", async () => {

        const source =
            makeFinanceFixture().accounts[0];

        const target = {
            ...source,
            id: "bank-jpy",
            kind: "bank" as const,
        };

        await finance.createAccount(
            source,
            TEST_DATE
        );

        await finance.createAccount(
            target,
            TEST_DATE
        );

        const transfer = createTransfer(
            source,
            target,
            1000,
            TEST_DATE,
            ""
        );

        await finance.createTransfer(
            transfer,
            TEST_DATE
        );

        const backup = await createBackup(db);

        expect(backup.transfers)
            .toEqual([transfer]);
    });

    it("rejects transfers to removed accounts", async () => {

        const data = makeFinanceFixture();

        const source = data.accounts[0];

        const target = {
            ...source,
            id: "removed-account",
        };

        await restoreBackup(db, data);

        const transfer = createTransfer(
            source,
            target,
            1000,
            TEST_DATE,
            ""
        );

        await expect(
            finance.createTransfer(
                transfer,
                TEST_DATE
            )
        ).rejects.toMatchObject({
            code: "ACCOUNT_NOT_FOUND",
        });

        const current = await createBackup(db);

        expect(current.transfers).toEqual([]);

        expect(current.accounts)
            .toEqual(data.accounts);
    });

    it("rolls back duplicate transaction IDs", async () => {

        const data = makeFinanceFixture();

        await restoreBackup(db, data);

        await expect(
            finance.createTransaction(
                data.transactions[0],
                "JPY",
                TEST_DATE
            )
        ).rejects.toMatchObject({
            code: "RECORD_CONFLICT",
        });

        const current = await createBackup(db);

        expect(current.transactions)
            .toEqual(data.transactions);
    });
});