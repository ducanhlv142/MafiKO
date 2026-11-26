import type { FinanceBackup } from "./backup";
import { categories } from "../domain/finance/category.js";
import { isValidBudget } from "../domain/finance/budget.js";
import { FINANCE_STORES } from "./backup.js";
import { isValidCurrency } from
    "../domain/finance/currency.js";
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

function validDate(value: unknown): value is string {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validAmount(value: unknown): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

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

    if (data?.app !== "MafiKO" || ![1, 2, 3, 4].includes(data.formatVersion) ||
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
            throw new Error("Bản sao chứa ngân sách không hợp lệ.");
        }
    }

    checkIds(data.accounts, "Tài khoản");
    checkIds(data.transactions, "Thu/chi");
    checkIds(data.transfers, "Chuyển tiền");

    const accounts = new Map<string, { currency: string; start: string }>();

    for (const a of data.accounts) {
        if (typeof a.name !== "string" || !a.name.trim() ||
            !["cash", "bank", "e_wallet", "credit_card"].includes(a.kind) ||
            !isValidCurrency(a.currency) ||
            !Number.isSafeInteger(a.openingBalanceMinor) || !validDate(a.openingBalanceDate)) {
            throw new Error(`Tài khoản ${a.id} có dữ liệu không hợp lệ.`);
        }
        accounts.set(a.id, { currency: a.currency, start: a.openingBalanceDate });
    }

    for (const t of data.transactions) {
        const account = accounts.get(t.accountId);
        const kind = t.kind;
        if (!account || (kind !== "expense" && kind !== "income") ||
            !validAmount(t.amountMinor) || !validDate(t.date) ||
            t.date < account.start || typeof t.note !== "string") {
            throw new Error(`Giao dịch ${t.id} không hợp lệ.`);
        }

        const labels = kind === "expense" ? categories.expense : categories.income;
        if (t.categoryId !== undefined &&
            (typeof t.categoryId !== "string" || !Object.hasOwn(labels, t.categoryId))) {
            throw new Error(`Giao dịch ${t.id} có danh mục sai.`);
        }
    }

    for (const t of data.transfers) {
        const from = accounts.get(t.fromAccountId);
        const to = accounts.get(t.toAccountId);
        if (!from || !to || t.fromAccountId === t.toAccountId ||
            from.currency !== t.currency || to.currency !== t.currency ||
            !validAmount(t.amountMinor) || !validDate(t.date) ||
            t.date < from.start || t.date < to.start || typeof t.note !== "string") {
            throw new Error(`Khoản chuyển ${t.id} không hợp lệ.`);
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
        formatVersion: 4,
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