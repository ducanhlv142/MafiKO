import type { FinanceBackup } from "./backup";
import { isValidBudget } from "../domain/finance/budget.js";
import {
    FINANCE_STORES,
    BACKUP_FORMAT_VERSION,
} from "./backup.js";

import {
    createDefaultCategories,
    assertValidCategoryCatalog,
    createCategoryCatalog,
    assertCategoryReference,
} from "../domain/finance/category-catalog.js";

import type { CategoryRecord } from
    "../domain/finance/category-catalog";
import type {
    SavingsPlan,
    SavingsMovement,
} from "../domain/finance/savings";

import {
    isValidSavingsPlan,
    isValidSavingsMovement,
    summarizeSavings,
} from "../domain/finance/savings.js";

import type {
    Loan,
    LoanPayment,
} from "../domain/finance/debt";

import {
    isValidLoan,
    isValidLoanPayment,
    summarizeLoan,
} from "../domain/finance/debt.js";
import { isValidAccount } from
    "../domain/finance/account.js";

import { isValidTransaction } from
    "../domain/finance/transaction.js";

import { isValidTransfer } from
    "../domain/finance/transfer.js";

import { DomainError } from
    "../domain/finance/errors.js";

function checkIds(rows: unknown[], label: string) {
    const seen = new Set<string>();

    for (const row of rows) {
        if (!row || typeof row !== "object" || !("id" in row) ||
            typeof row.id !== "string" || !row.id.trim() || seen.has(row.id)) {
            throw new Error(`${label}: thiếu ID hoặc trùng ID.`);
        }
        seen.add(row.id);
    }
}

export function parseBackup(text: string): FinanceBackup {
    const data = JSON.parse(text);

    if (data?.app !== "MafiKO" || ![1, 2, 3, 4, 5].includes(data.formatVersion) ||
        typeof data.exportedAt !== "string" || !Number.isFinite(Date.parse(data.exportedAt)) ||
        !Array.isArray(data.accounts) || !Array.isArray(data.transactions) ||
        !Array.isArray(data.transfers)) {
        throw new Error("Sai định dạng bản sao MafiKO.");
    }

    if (data.formatVersion === 1) {
        data.budgets = [];
    }

    if (data.formatVersion < 3) {
        data.loans = [];
        data.loanPayments = [];
    }

    if (data.formatVersion < 4) {
        data.savingsPlans = [];
        data.savingsMovements = [];
    }

    if (data.formatVersion < 5) {

        data.categories =
            createDefaultCategories();
    }

    if (!Array.isArray(data.categories)) {

        throw new DomainError(
            "INVALID_BACKUP"
        );
    }

    const categoryRecords: CategoryRecord[] =
        data.categories;

    assertValidCategoryCatalog(
        categoryRecords
    );

    const catalog =
        createCategoryCatalog(
            categoryRecords
        );

    // Temporary compatibility gate.
    // Remove when dynamic categories are fully integrated.

    const defaults = createDefaultCategories();

    const isDefaultCatalog =
        categoryRecords.length === defaults.length &&

        defaults.every(expected =>

            categoryRecords.some(current =>

                current.id === expected.id &&

                current.kind === expected.kind &&

                current.name === expected.name &&

                current.archived === expected.archived &&

                current.parentId === expected.parentId
            )
        );

    if (!isDefaultCatalog) {

        throw new DomainError(
            "INVALID_BACKUP",
            "Danh mục tùy chỉnh chưa được hỗ trợ trong phiên bản này."
        );
    }

    if (
        !Array.isArray(data.savingsPlans) ||
        !Array.isArray(data.savingsMovements)
    ) {
        throw new Error(
            "Danh sách tiết kiệm không hợp lệ."
        );
    }

    checkIds(
        data.savingsPlans,
        "Sổ tiết kiệm"
    );

    checkIds(
        data.savingsMovements,
        "Biến động tiết kiệm"
    );

    if (
        !Array.isArray(data.loans) ||
        !Array.isArray(data.loanPayments)
    ) {
        throw new Error(
            "Danh sách khoản vay hoặc thanh toán không hợp lệ."
        );
    }

    checkIds(data.loans, "Khoản vay");
    checkIds(data.loanPayments, "Thanh toán khoản vay");

    if (!Array.isArray(data.budgets)) {
        throw new Error("Danh sách ngân sách không hợp lệ.");
    }

    checkIds(data.budgets, "Ngân sách");

    for (const budget of data.budgets) {

        if (!isValidBudget(budget)) {

            throw new DomainError(
                "INVALID_BUDGET"
            );
        }

        assertCategoryReference(
            catalog,
            budget.categoryId,
            "expense",
            true
        );
    }

    checkIds(data.accounts, "Tài khoản");
    checkIds(data.transactions, "Thu/chi");
    checkIds(data.transfers, "Chuyển tiền");

    const accounts = new Map<
        string,
        {
            currency: string;
            start: string;
        }
    >();

    for (const account of data.accounts) {

        if (!isValidAccount(account)) {
            throw new DomainError("INVALID_ACCOUNT");
        }

        accounts.set(account.id, {
            currency: account.currency,
            start: account.openingBalanceDate,
        });
    }

    for (const entry of data.transactions) {

        if (!isValidTransaction(entry)) {
            throw new DomainError(
                "INVALID_TRANSACTION"
            );
        }

        assertCategoryReference(
            catalog,
            entry.categoryId,
            entry.kind,
            true
        );

        const account = accounts.get(
            entry.accountId
        );

        if (!account) {
            throw new DomainError(
                "ACCOUNT_NOT_FOUND"
            );
        }

        if (entry.date < account.start) {
            throw new DomainError("INVALID_DATE");
        }
    }

    for (const transfer of data.transfers) {

        if (!isValidTransfer(transfer)) {
            throw new DomainError(
                "INVALID_TRANSFER"
            );
        }

        const from = accounts.get(
            transfer.fromAccountId
        );

        const to = accounts.get(
            transfer.toAccountId
        );

        if (!from || !to) {
            throw new DomainError(
                "ACCOUNT_NOT_FOUND"
            );
        }

        if (
            from.currency !== transfer.currency ||
            to.currency !== transfer.currency
        ) {
            throw new DomainError(
                "CURRENCY_MISMATCH"
            );
        }

        if (
            transfer.date < from.start ||
            transfer.date < to.start
        ) {
            throw new DomainError("INVALID_DATE");
        }
    }

    const loans = new Map<string, Loan>();

    for (const loan of data.loans) {
        if (!isValidLoan(loan)) {
            throw new Error(
                "Bản sao chứa khoản vay không hợp lệ."
            );
        }

        const account = accounts.get(loan.accountId);

        if (
            !account ||
            account.currency !== loan.currency ||
            loan.startDate < account.start
        ) {
            throw new Error(
                `Khoản vay ${loan.id} có tài khoản không hợp lệ.`
            );
        }

        loans.set(loan.id, loan);
    }

    const paymentsByLoan =
        new Map<string, LoanPayment[]>();

    for (const payment of data.loanPayments) {
        if (!isValidLoanPayment(payment)) {
            throw new Error(
                "Bản sao chứa khoản thanh toán không hợp lệ."
            );
        }

        const loan = loans.get(payment.loanId);
        const account = accounts.get(payment.accountId);

        if (
            !loan ||
            !account ||
            account.currency !== loan.currency ||
            payment.date < loan.startDate ||
            payment.date < account.start
        ) {
            throw new Error(
                `Khoản thanh toán ${payment.id} không hợp lệ.`
            );
        }

        const payments =
            paymentsByLoan.get(loan.id) ?? [];

        payments.push(payment);

        paymentsByLoan.set(loan.id, payments);
    }

    for (const loan of loans.values()) {
        summarizeLoan(
            loan,
            paymentsByLoan.get(loan.id) ?? []
        );
    }

    const savingsPlans =
        new Map<string, SavingsPlan>();

    for (const plan of data.savingsPlans) {

        if (!isValidSavingsPlan(plan)) {
            throw new Error(
                "Bản sao chứa sổ tiết kiệm không hợp lệ."
            );
        }

        const account = accounts.get(
            plan.accountId
        );

        if (
            !account ||
            account.currency !== plan.currency ||
            plan.startDate < account.start
        ) {
            throw new Error(
                `Sổ tiết kiệm ${plan.id} có tài khoản không hợp lệ.`
            );
        }

        savingsPlans.set(plan.id, plan);
    }

    const movementsBySavings =
        new Map<string, SavingsMovement[]>();

    for (const movement of data.savingsMovements) {

        if (!isValidSavingsMovement(movement)) {
            throw new Error(
                "Bản sao chứa biến động tiết kiệm không hợp lệ."
            );
        }

        const plan = savingsPlans.get(
            movement.savingsId
        );

        const account = accounts.get(
            movement.accountId
        );

        if (
            !plan ||
            !account ||
            account.currency !== plan.currency ||
            movement.date < plan.startDate ||
            movement.date < account.start
        ) {
            throw new Error(
                `Biến động tiết kiệm ${movement.id} không hợp lệ.`
            );
        }

        const history =
            movementsBySavings.get(plan.id) ?? [];

        history.push(movement);

        movementsBySavings.set(
            plan.id,
            history
        );
    }

    for (const plan of savingsPlans.values()) {

        summarizeSavings(
            plan,
            movementsBySavings.get(plan.id) ?? []
        );
    }

    return {
        ...data,
        formatVersion: BACKUP_FORMAT_VERSION,
    };
}

export function restoreBackup(db: IDBDatabase, backup: FinanceBackup): Promise<void> {
    const stores = FINANCE_STORES;

    return new Promise((resolve, reject) => {
        const tx = db.transaction([...stores], "readwrite");
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error ?? new Error("Khôi phục đã bị hủy."));

        try {
            for (const name of stores) {
                const store = tx.objectStore(name);
                store.clear();
                for (const record of backup[name]) store.add(record);
            }
        } catch (error) {
            tx.abort();
            reject(error);
        }
    });
}