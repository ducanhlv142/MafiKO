import type { FinanceBackup } from "./backup";
import { categories } from "../domain/finance/category.js";

function csvCell(value: string | number): string {
    if (typeof value === "number") return String(value);

    // Giữ nội dung người dùng nhập dưới dạng văn bản khi mở bằng Excel.
    const text = /^\s*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value)
        ? `'${value}`
        : value;

    return `"${text.replaceAll('"', '""')}"`;
}

export function createLedgerCsv(backup: FinanceBackup): string {
    const accounts = new Map(backup.accounts.map((a) => [a.id, a]));

    function getAccount(id: string) {
        const account = accounts.get(id);
        if (!account) throw new Error(`Không tìm thấy tài khoản ${id}.`);
        return account;
    }

    const header = [
        "Ngày", "Loại", "Tài khoản nguồn", "Tài khoản đích",
        "Danh mục", "Số tiền", "Tiền tệ", "Nội dung",
    ];
    const rows: (string | number)[][] = [];

    for (const t of backup.transactions) {
        const account = getAccount(t.accountId);
        const isExpense = t.kind === "expense";
        const labels: Readonly<Record<string, string>> = categories[t.kind];

        rows.push([
            t.date,
            isExpense ? "Chi" : "Thu",
            isExpense ? account.name : "",
            isExpense ? "" : account.name,
            labels[t.categoryId ?? ""] ?? "Chưa phân loại",
            t.amountMinor,
            account.currency,
            t.note,
        ]);
    }

    for (const t of backup.transfers) {
        rows.push([
            t.date, "Chuyển tiền",
            getAccount(t.fromAccountId).name,
            getAccount(t.toAccountId).name,
            "", t.amountMinor, t.currency, t.note,
        ]);
    }

    rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    return "\uFEFF" + [header, ...rows]
        .map((row) => row.map(csvCell).join(","))
        .join("\r\n");
}