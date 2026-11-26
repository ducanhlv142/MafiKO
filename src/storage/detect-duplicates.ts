import type { Transaction } from "../domain/finance/transaction";
import type { Transfer } from "../domain/finance/transfer";
import type { FinanceBackup } from "./backup";
import type { ImportRow } from "./import-csv";

function comparableNote(note: string): string {
    return /^\s*[=+\-@]/.test(note) || /^[\t\r\n]/.test(note)
        ? `'${note}`
        : note;
}

function transactionKey(t: Transaction): string {
    return JSON.stringify([
        "transaction",
        t.accountId,
        t.kind,
        t.date,
        t.amountMinor,
        comparableNote(t.note),
    ]);
}

function transferKey(t: Transfer): string {
    return JSON.stringify([
        "transfer",
        t.fromAccountId,
        t.toAccountId,
        t.currency,
        t.date,
        t.amountMinor,
        comparableNote(t.note),
    ]);
}

export function detectDuplicates(
    rows: ImportRow[],
    backup: FinanceBackup,
): Map<number, string> {
    const existing = new Set<string>();
    const seen = new Set<string>();
    const duplicates = new Map<number, string>();

    for (const t of backup.transactions) {
        existing.add(transactionKey(t));
    }

    for (const t of backup.transfers) {
        existing.add(transferKey(t));
    }

    for (const row of rows) {
        const key = row.type === "transaction"
            ? transactionKey(row.data)
            : transferKey(row.data);

        if (existing.has(key)) {
            duplicates.set(
                row.rowNumber,
                "Đã có trong sổ"
            );
        } else if (seen.has(key)) {
            duplicates.set(
                row.rowNumber,
                "Trùng trong file CSV"
            );
        }

        seen.add(key);
    }

    return duplicates;
}