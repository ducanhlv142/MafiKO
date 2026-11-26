import type { Row } from "exceljs";
import type { FinanceBackup } from "./backup";
import type { ImportRow } from "./import-csv";
import type { Transaction } from "../domain/finance/transaction";
import type { Transfer } from "../domain/finance/transfer";

import { categories } from "../domain/finance/category.js";
import { parseBackup } from "./restore.js";
import { detectDuplicates } from "./detect-duplicates.js";

const ExcelJS = (
    globalThis as typeof globalThis & {
        ExcelJS: typeof import("exceljs");
    }
).ExcelJS;

export type ExcelImportRow = ImportRow & {
    location: string;
};

function text(row: Row, col: number): string {
    const value = row.getCell(col).value;

    if (value === null || value === undefined) return "";

    if (typeof value !== "string") {
        throw new Error(`Cột ${col} phải là văn bản.`);
    }

    return value;
}

function amount(row: Row, col: number): number {
    const value = row.getCell(col).value;

    if (
        typeof value !== "number" ||
        !Number.isSafeInteger(value) ||
        value <= 0
    ) {
        throw new Error("Số tiền phải là số nguyên dương.");
    }

    return value;
}

function transactionSignature(t: Transaction): string {
    return JSON.stringify([
        t.accountId,
        t.kind,
        t.date,
        t.amountMinor,
        t.categoryId ?? "",
        t.note,
    ]);
}

function transferSignature(t: Transfer): string {
    return JSON.stringify([
        t.fromAccountId,
        t.toAccountId,
        t.currency,
        t.date,
        t.amountMinor,
        t.note,
    ]);
}

export async function prepareExcelImport(
    buffer: ArrayBuffer,
    backup: FinanceBackup
) {
    const workbook = new ExcelJS.Workbook();

    await workbook.xlsx.load(buffer);

    const transactionsSheet =
        workbook.getWorksheet("Transactions");

    const transfersSheet =
        workbook.getWorksheet("Transfers");

    if (!transactionsSheet || !transfersSheet) {
        throw new Error(
            "Excel phải có sheet Transactions và Transfers."
        );
    }

    const transactionHeaders = [
        "ID", "Ngày", "Loại", "ID tài khoản",
        "Tài khoản", "Danh mục", "Số tiền",
        "Tiền tệ", "Nội dung",
    ];

    const transferHeaders = [
        "ID", "Ngày", "ID nguồn", "Tài khoản nguồn",
        "ID đích", "Tài khoản đích", "Số tiền",
        "Tiền tệ", "Nội dung",
    ];

    for (const [sheet, headers] of [
        [transactionsSheet, transactionHeaders],
        [transfersSheet, transferHeaders],
    ] as const) {
        if (!headers.every(
            (h, i) => sheet.getRow(1).getCell(i + 1).value === h
        )) {
            throw new Error(
                `Sai cấu trúc sheet ${sheet.name}.`
            );
        }
    }

    const accounts = new Map(
        backup.accounts.map(a => [a.id, a])
    );

    const rows: ExcelImportRow[] = [];

    function checkAccount(id: string, currency: string) {
        const account = accounts.get(id);

        if (!account) {
            throw new Error(`Không tìm thấy tài khoản ${id}.`);
        }

        if (account.currency !== currency) {
            throw new Error("Tiền tệ không khớp tài khoản.");
        }

        return account;
    }

    transactionsSheet.eachRow((row, number) => {
        if (number === 1) return;

        try {
            const label = text(row, 3);

            if (label !== "Thu" && label !== "Chi") {
                throw new Error("Loại giao dịch không hợp lệ.");
            }

            const kind = label === "Thu" ? "income" : "expense";

            const account = checkAccount(
                text(row, 4),
                text(row, 8)
            );

            const category = text(row, 6);

            let categoryId: Transaction["categoryId"];

            if (category && category !== "Chưa phân loại") {
                const match = Object.entries(categories[kind])
                    .find(([, name]) => name === category);

                if (!match) {
                    throw new Error("Danh mục không hợp lệ.");
                }

                categoryId =
                    match[0] as Transaction["categoryId"];
            }

            rows.push({
                rowNumber: rows.length + 1,
                location: `Transactions:${number}`,
                type: "transaction",
                data: {
                    id: text(row, 1) || crypto.randomUUID(),
                    date: text(row, 2),
                    kind,
                    accountId: account.id,
                    amountMinor: amount(row, 7),
                    categoryId,
                    note: text(row, 9),
                },
            });

        } catch (error) {
            throw new Error(
                `Transactions dòng ${number}: ${String(error)}`
            );
        }
    });

    transfersSheet.eachRow((row, number) => {
        if (number === 1) return;

        try {
            const currency = text(row, 8);

            const from = checkAccount(
                text(row, 3), currency
            );

            const to = checkAccount(
                text(row, 5), currency
            );

            rows.push({
                rowNumber: rows.length + 1,
                location: `Transfers:${number}`,
                type: "transfer",
                data: {
                    id: text(row, 1) || crypto.randomUUID(),
                    date: text(row, 2),
                    fromAccountId: from.id,
                    toAccountId: to.id,
                    currency: from.currency,
                    amountMinor: amount(row, 7),
                    note: text(row, 9),
                },
            });

        } catch (error) {
            throw new Error(
                `Transfers dòng ${number}: ${String(error)}`
            );
        }
    });

    const transactions: Transaction[] = [];
    const transfers: Transfer[] = [];

    for (const row of rows) {
        if (row.type === "transaction") {
            transactions.push(row.data);
        } else {
            transfers.push(row.data);
        }
    }

    // Tận dụng bộ validation của Module 10.
    parseBackup(JSON.stringify({
        ...backup,
        transactions,
        transfers,
    }));

    const duplicates = detectDuplicates(rows, backup);

    const existingTransactions = new Map(
        backup.transactions.map(t => [t.id, t])
    );

    const existingTransfers = new Map(
        backup.transfers.map(t => [t.id, t])
    );

    const conflicts = new Map<number, string>();

    for (const row of rows) {
        if (row.type === "transaction") {
            const old = existingTransactions.get(row.data.id);

            if (!old) continue;

            if (
                transactionSignature(old) ===
                transactionSignature(row.data)
            ) {
                duplicates.set(row.rowNumber, "Trùng ID gốc");
            } else {
                conflicts.set(row.rowNumber, "Xung đột ID");
            }

        } else {
            const old = existingTransfers.get(row.data.id);

            if (!old) continue;

            if (
                transferSignature(old) ===
                transferSignature(row.data)
            ) {
                duplicates.set(row.rowNumber, "Trùng ID gốc");
            } else {
                conflicts.set(row.rowNumber, "Xung đột ID");
            }
        }
    }

    for (const key of conflicts.keys()) {
        duplicates.delete(key);
    }

    const newRows = rows.filter(
        row =>
            !duplicates.has(row.rowNumber) &&
            !conflicts.has(row.rowNumber)
    );

    return {
        rows,
        newRows,
        duplicates,
        conflicts,
    };
}