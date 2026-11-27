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

describe("Transaction Mutations", () => {

    it("updates transactions through the service", async () => {

        const data = makeFinanceFixture();

        const entry = data.transactions[0];

        await finance.updateTransaction(
            entry,
            {
                kind: entry.kind,
                categoryId: entry.categoryId,
                amountMinor: 1000,
                date: entry.date,
                note: entry.note,
            },
            TEST_DATE
        );

        const current = await createBackup(db);

        expect(
            current.transactions.find(
                t => t.id === entry.id
            )?.amountMinor
        ).toBe(1000);

        expect(
            getAccountBalance(
                current.accounts[0],
                current
            )
        ).toBe(3250);
    });

    it("deletes transactions through the service", async () => {

        const data = makeFinanceFixture();

        await finance.deleteTransaction(
            data.transactions[0]
        );

        const current = await createBackup(db);

        expect(
            current.transactions
        ).toHaveLength(1);

        expect(
            getAccountBalance(
                current.accounts[0],
                current
            )
        ).toBe(4250);
    });

    it("changes categories without changing cash balance", async () => {

        const data = makeFinanceFixture();

        await finance.changeCategory(
            data.transactions[0],
            "shopping"
        );

        const current = await createBackup(db);

        expect(
            current.transactions.find(
                t => t.id === data.transactions[0].id
            )?.categoryId
        ).toBe("shopping");

        expect(
            getAccountBalance(
                current.accounts[0],
                current
            )
        ).toBe(3598);
    });

    it("rejects stale category changes", async () => {

        const data = makeFinanceFixture();

        const entry = data.transactions[0];

        await finance.changeCategory(
            entry,
            "shopping"
        );

        await expect(
            finance.changeCategory(
                entry,
                "housing"
            )
        ).rejects.toMatchObject({
            code: "RECORD_CONFLICT",
        });

        const current = await createBackup(db);

        expect(
            current.transactions.find(
                t => t.id === entry.id
            )?.categoryId
        ).toBe("shopping");
    });
});

describe("Transfer Mutations", () => {

    it("updates and deletes transfers safely", async () => {

        const data = makeFinanceFixture();

        const source = data.accounts[0];

        const target = {
            ...source,
            id: "bank-jpy",
            kind: "bank" as const,
            openingBalanceMinor: 10000,
        };

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

        await finance.updateTransfer(
            transfer,
            {
                amountMinor: 2000,
                date: TEST_DATE,
                note: "Updated transfer",
            },
            TEST_DATE
        );

        const updated = await createBackup(db);

        expect(
            updated.transfers[0].amountMinor
        ).toBe(2000);

        expect(
            getAccountBalance(source, updated)
        ).toBe(1598);

        expect(
            getAccountBalance(target, updated)
        ).toBe(12000);

        await finance.deleteTransfer(
            updated.transfers[0]
        );

        const current = await createBackup(db);

        expect(current.transfers).toEqual([]);

        expect(
            getAccountBalance(source, current)
        ).toBe(3598);

        expect(
            getAccountBalance(target, current)
        ).toBe(10000);
    });
});

describe("Budget Mutations", () => {

    it("updates and deletes budgets", async () => {

        const data = makeFinanceFixture();

        const original = data.budgets[0];

        const next = {
            ...original,
            limitMinor: 6000,
        };

        await finance.saveBudget(
            next,
            original
        );

        const updated = await createBackup(db);

        expect(updated.budgets)
            .toEqual([next]);

        await finance.deleteBudget(next);

        const current = await createBackup(db);

        expect(current.budgets).toEqual([]);
    });

    it("rejects stale budget updates", async () => {

        const data = makeFinanceFixture();

        const original = data.budgets[0];

        const next = {
            ...original,
            limitMinor: 6000,
        };

        await finance.saveBudget(
            next,
            original
        );

        await expect(
            finance.saveBudget(
                {
                    ...original,
                    limitMinor: 7000,
                },
                original
            )
        ).rejects.toBeDefined();

        const current = await createBackup(db);

        expect(
            current.budgets[0].limitMinor
        ).toBe(6000);
    });
});

describe("Debt Mutations", () => {

    it("creates loans and payments through the service", async () => {

        const data = makeFinanceFixture();

        const loan = {
            ...data.loans[0],
            id: "new-loan",
            principalMinor: 1000,
        };

        await finance.saveLoan(
            loan,
            TEST_DATE
        );

        const payment = {
            ...data.loanPayments[0],
            id: "new-payment",
            loanId: loan.id,
            principalMinor: 200,
            interestMinor: 20,
            feeMinor: 0,
        };

        await finance.saveLoanPayment(
            payment,
            loan,
            TEST_DATE
        );

        const current = await createBackup(db);

        expect(current.loans)
            .toContainEqual(loan);

        expect(current.loanPayments)
            .toContainEqual(payment);

        expect(
            getAccountBalance(
                current.accounts[0],
                current
            )
        ).toBe(4378);

        expect(
            getReportTransactions(current)
                .find(
                    t => t.id ===
                        "loan-report:new-payment"
                )?.amountMinor
        ).toBe(20);
    });

    it("rejects deletion of loans with payment history", async () => {

        const data = makeFinanceFixture();

        await expect(
            finance.mutateDebt(
                data.loans[0],
                {
                    kind: "deleteLoan",
                },
                TEST_DATE
            )
        ).rejects.toBeDefined();

        const current = await createBackup(db);

        expect(current.loans)
            .toEqual(data.loans);

        expect(current.loanPayments)
            .toEqual(data.loanPayments);
    });

    it("updates and deletes loan payments", async () => {

        const data = makeFinanceFixture();

        const loan = data.loans[0];

        const original = data.loanPayments[0];

        const next = {
            ...original,
            principalMinor: 6000,
        };

        await finance.mutateDebt(
            loan,
            {
                kind: "updatePayment",
                expected: original,
                next,
            },
            TEST_DATE
        );

        const updated = await createBackup(db);

        expect(
            updated.loanPayments.find(
                p => p.id === original.id
            )?.principalMinor
        ).toBe(6000);

        expect(
            getAccountBalance(
                updated.accounts[0],
                updated
            )
        ).toBe(2598);

        await finance.mutateDebt(
            loan,
            {
                kind: "deletePayment",
                expected: next,
            },
            TEST_DATE
        );

        const current = await createBackup(db);

        expect(
            current.loanPayments
        ).toHaveLength(1);

        expect(
            getAccountBalance(
                current.accounts[0],
                current
            )
        ).toBe(9098);
    });
});