import type { FinanceBackup } from "./backup";
import { categories } from "../domain/finance/category.js";
import { isValidBudget } from "../domain/finance/budget.js";

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

    if (data?.app !== "MafiKO" || (data.formatVersion !== 1 && data.formatVersion !== 2) ||
        typeof data.exportedAt !== "string" || !Number.isFinite(Date.parse(data.exportedAt)) ||
        !Array.isArray(data.accounts) || !Array.isArray(data.transactions) ||
        !Array.isArray(data.transfers)) {
        throw new Error("Sai định dạng bản sao MafiKO.");
    }

    if (data.formatVersion === 1) {
        data.budgets = [];
    }

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
            !["VND", "JPY"].includes(a.currency) ||
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

    return {
        ...data,
        formatVersion: 2,
    };
}

export function restoreBackup(db: IDBDatabase, backup: FinanceBackup): Promise<void> {
    const stores = [
        "accounts",
        "transactions",
        "transfers",
        "budgets",
    ] as const;

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