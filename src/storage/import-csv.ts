import type { Account } from "../domain/finance/account";
import type { Transaction } from "../domain/finance/transaction";
import type { Transfer } from "../domain/finance/transfer";

import { categories } from "../domain/finance/category.js";
import { createTransfer } from "../domain/finance/transfer.js";
import { parseCsv } from "./parse-csv.js";

export type ImportRow =
    | { rowNumber: number; type: "transaction"; data: Transaction }
    | { rowNumber: number; type: "transfer"; data: Transfer };

export interface CsvImportResult {
    rows: ImportRow[];
    errors: {
        rowNumber: number;
        message: string;
    }[];
}

const expectedHeader = [
    "Ngày",
    "Loại",
    "Tài khoản nguồn",
    "Tài khoản đích",
    "Danh mục",
    "Số tiền",
    "Tiền tệ",
    "Nội dung",
];

function validDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }

    const date = new Date(`${value}T00:00:00Z`);

    return Number.isFinite(date.getTime()) &&
        date.toISOString().slice(0, 10) === value;
}

function findAccount(
    accounts: Account[],
    name: string,
    currency: string,
    date: string,
): Account {
    const matches = accounts.filter(
        a => a.name === name && a.currency === currency
    );

    if (matches.length === 0) {
        throw new Error(
            `Không tìm thấy tài khoản "${name}" (${currency}).`
        );
    }

    if (matches.length > 1) {
        throw new Error(
            `Có nhiều tài khoản trùng tên "${name}".`
        );
    }

    const account = matches[0];

    if (date < account.openingBalanceDate) {
        throw new Error("Ngày giao dịch trước ngày mở tài khoản.");
    }

    return account;
}

export function prepareCsvImport(
    content: string,
    accounts: Account[],
): CsvImportResult {
    const [header, ...records] = parseCsv(content);

    if (
        !header ||
        header.length !== expectedHeader.length ||
        !expectedHeader.every((value, i) => header[i] === value)
    ) {
        throw new Error("CSV không đúng định dạng MafiKO.");
    }

    const result: CsvImportResult = {
        rows: [],
        errors: [],
    };

    for (const [index, record] of records.entries()) {
        const rowNumber = index + 2;

        if (record.every(value => value.trim() === "")) {
            continue;
        }

        try {
            if (record.length !== 8) {
                throw new Error("Dòng dữ liệu phải có đủ 8 cột.");
            }

            const [
                date, type, source, destination,
                category, amountText, currency, note,
            ] = record;

            const amountMinor = Number(amountText);

            if (!validDate(date)) {
                throw new Error("Ngày không hợp lệ, yêu cầu YYYY-MM-DD.");
            }

            if (
                !/^\d+$/.test(amountText) ||
                !Number.isSafeInteger(amountMinor) ||
                amountMinor <= 0
            ) {
                throw new Error("Số tiền phải là số nguyên dương.");
            }

            if (currency !== "VND" && currency !== "JPY") {
                throw new Error("Tiền tệ không được hỗ trợ.");
            }

            if (type === "Chuyển tiền") {
                if (category !== "") {
                    throw new Error("Chuyển tiền không có danh mục.");
                }

                const from = findAccount(
                    accounts, source, currency, date
                );

                const to = findAccount(
                    accounts, destination, currency, date
                );

                const transfer = createTransfer(
                    from, to, amountMinor, date, note
                );

                result.rows.push({
                    rowNumber,
                    type: "transfer",
                    data: transfer,
                });

                continue;
            }

            if (type !== "Thu" && type !== "Chi") {
                throw new Error(`Loại giao dịch "${type}" không hợp lệ.`);
            }

            const kind = type === "Thu" ? "income" : "expense";

            if (
                (kind === "income" && source !== "") ||
                (kind === "expense" && destination !== "")
            ) {
                throw new Error("Sai tài khoản nguồn hoặc đích.");
            }

            const account = findAccount(
                accounts,
                kind === "income" ? destination : source,
                currency,
                date,
            );

            let categoryId: Transaction["categoryId"];

            if (category !== "" && category !== "Chưa phân loại") {
                const match = Object.entries(categories[kind])
                    .find(([, label]) => label === category);

                if (!match) {
                    throw new Error(
                        `Danh mục "${category}" không hợp lệ.`
                    );
                }

                categoryId = match[0] as Transaction["categoryId"];
            }

            const transaction: Transaction = {
                id: crypto.randomUUID(),
                accountId: account.id,
                kind,
                amountMinor,
                date,
                note,
                categoryId,
            };

            result.rows.push({
                rowNumber,
                type: "transaction",
                data: transaction,
            });

        } catch (error) {
            result.errors.push({
                rowNumber,
                message: error instanceof Error
                    ? error.message
                    : "Dữ liệu không hợp lệ.",
            });
        }
    }

    return result;
}