import type { FinanceBackup } from "./backup";
import { categories } from "../domain/finance/category.js";
import { calculateBalance } from "../domain/finance/balance.js";
import { toMovement } from "../domain/finance/transaction.js";
import { transferMovement } from "../domain/finance/transfer.js";

const ExcelJS = (
    globalThis as typeof globalThis & {
        ExcelJS: typeof import("exceljs");
    }
).ExcelJS;

export async function createExcelWorkbook(
    backup: FinanceBackup
): Promise<Blob> {

    const workbook = new ExcelJS.Workbook();

    workbook.creator = "MafiKO";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Accounts");

    sheet.columns = [
        { header: "ID", key: "id", width: 40 },
        { header: "Tên tài khoản", key: "name", width: 25 },
        { header: "Loại tài khoản", key: "kind", width: 20 },
        { header: "Tiền tệ", key: "currency", width: 12 },
        { header: "Số dư đầu kỳ", key: "balance", width: 22 },
        { header: "Ngày bắt đầu", key: "date", width: 18 },
    ];

    const accountKinds = {
        cash: "Tiền mặt",
        bank: "Ngân hàng",
        e_wallet: "Ví điện tử",
        credit_card: "Thẻ tín dụng",
    };

    for (const account of backup.accounts) {
        sheet.addRow({
            id: account.id,
            name: account.name,
            kind: accountKinds[account.kind],
            currency: account.currency,
            balance: account.openingBalanceMinor,
            date: account.openingBalanceDate,
        });
    }

    sheet.getRow(1).font = {
        bold: true,
        color: { argb: "FFFFFFFF" },
    };

    sheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1E293B" },
    };

    sheet.getColumn("balance").numFmt = "#,##0";

    sheet.views = [
        { state: "frozen", ySplit: 1 },
    ];

    sheet.autoFilter = "A1:F1";

    const accountMap = new Map(
        backup.accounts.map(a => [a.id, a])
    );

    const transactionsSheet = workbook.addWorksheet("Transactions");

    transactionsSheet.columns = [
        { header: "ID", key: "id", width: 40 },
        { header: "Ngày", key: "date", width: 16 },
        { header: "Loại", key: "kind", width: 12 },
        { header: "ID tài khoản", key: "accountId", width: 40 },
        { header: "Tài khoản", key: "account", width: 25 },
        { header: "Danh mục", key: "category", width: 22 },
        { header: "Số tiền", key: "amount", width: 20 },
        { header: "Tiền tệ", key: "currency", width: 12 },
        { header: "Nội dung", key: "note", width: 40 },
    ];

    for (const t of backup.transactions) {
        const account = accountMap.get(t.accountId);

        if (!account) {
            throw new Error(`Không tìm thấy tài khoản ${t.accountId}.`);
        }

        const labels: Readonly<Record<string, string>> =
            categories[t.kind];

        transactionsSheet.addRow({
            id: t.id,
            date: t.date,
            kind: t.kind === "income" ? "Thu" : "Chi",
            accountId: t.accountId,
            account: account.name,
            category: labels[t.categoryId ?? ""] ?? "Chưa phân loại",
            amount: t.amountMinor,
            currency: account.currency,
            note: t.note,
        });
    }

    const transfersSheet = workbook.addWorksheet("Transfers");

    transfersSheet.columns = [
        { header: "ID", key: "id", width: 40 },
        { header: "Ngày", key: "date", width: 16 },
        { header: "ID nguồn", key: "fromId", width: 40 },
        { header: "Tài khoản nguồn", key: "from", width: 25 },
        { header: "ID đích", key: "toId", width: 40 },
        { header: "Tài khoản đích", key: "to", width: 25 },
        { header: "Số tiền", key: "amount", width: 20 },
        { header: "Tiền tệ", key: "currency", width: 12 },
        { header: "Nội dung", key: "note", width: 40 },
    ];

    for (const t of backup.transfers) {
        const from = accountMap.get(t.fromAccountId);
        const to = accountMap.get(t.toAccountId);

        if (!from || !to) {
            throw new Error(`Khoản chuyển ${t.id} thiếu tài khoản.`);
        }

        transfersSheet.addRow({
            id: t.id,
            date: t.date,
            fromId: t.fromAccountId,
            from: from.name,
            toId: t.toAccountId,
            to: to.name,
            amount: t.amountMinor,
            currency: t.currency,
            note: t.note,
        });
    }

    for (const ws of [transactionsSheet, transfersSheet]) {
        ws.getRow(1).font = {
            bold: true,
            color: { argb: "FFFFFFFF" },
        };

        ws.getRow(1).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF1E293B" },
        };

        ws.getColumn("amount").numFmt = "#,##0";

        ws.views = [
            { state: "frozen", ySplit: 1 },
        ];

        ws.autoFilter = "A1:I1";
    }

    const overviewSheet = workbook.addWorksheet("Overview");

    overviewSheet.columns = [
        { header: "Tài khoản", key: "account", width: 28 },
        { header: "Loại tài khoản", key: "kind", width: 22 },
        { header: "Tiền tệ", key: "currency", width: 12 },
        { header: "Số dư / Dư nợ", key: "balance", width: 24 },
        { header: "Giá trị ròng", key: "net", width: 24 },
    ];

    const currencyTotals = new Map<string, number>();

    for (const account of backup.accounts) {
        const isCard = account.kind === "credit_card";

        const changes = backup.transactions
            .filter(t => t.accountId === account.id)
            .map(t => toMovement(t));

        for (const transfer of backup.transfers) {
            changes.push(
                transferMovement(transfer, account.id)
            );
        }

        const balance = calculateBalance(
            account.openingBalanceMinor,
            isCard ? changes.map(v => -v) : changes
        );

        const net = isCard ? -balance : balance;

        overviewSheet.addRow({
            account: account.name,
            kind: accountKinds[account.kind],
            currency: account.currency,
            balance,
            net,
        });

        currencyTotals.set(
            account.currency,
            (currencyTotals.get(account.currency) ?? 0) + net
        );
    }

    overviewSheet.addRow([]);

    for (const [currency, total] of currencyTotals) {
        const row = overviewSheet.addRow({
            account: "TỔNG GIÁ TRỊ RÒNG",
            currency,
            net: total,
        });

        row.font = { bold: true };
    }

    overviewSheet.getColumn("balance").numFmt = "#,##0";
    overviewSheet.getColumn("net").numFmt = "#,##0";

    const monthlySheet = workbook.addWorksheet("Monthly Report");

    monthlySheet.columns = [
        { header: "Tháng", key: "month", width: 16 },
        { header: "Tiền tệ", key: "currency", width: 14 },
        { header: "Tổng thu", key: "income", width: 22 },
        { header: "Tổng chi", key: "expense", width: 22 },
        { header: "Chênh lệch", key: "net", width: 22 },
    ];

    interface MonthlyTotal {
        month: string;
        currency: string;
        income: number;
        expense: number;
    }

    const monthlyTotals = new Map<string, MonthlyTotal>();

    for (const t of backup.transactions) {
        const account = accountMap.get(t.accountId)!;
        const month = t.date.slice(0, 7);
        const key = `${month}-${account.currency}`;

        let summary = monthlyTotals.get(key);

        if (!summary) {
            summary = {
                month,
                currency: account.currency,
                income: 0,
                expense: 0,
            };

            monthlyTotals.set(key, summary);
        }

        if (t.kind === "income") {
            summary.income += t.amountMinor;
        } else {
            summary.expense += t.amountMinor;
        }
    }

    const sortedMonths = [...monthlyTotals.values()].sort(
        (a, b) =>
            a.month.localeCompare(b.month) ||
            a.currency.localeCompare(b.currency)
    );

    for (const summary of sortedMonths) {
        monthlySheet.addRow({
            ...summary,
            net: summary.income - summary.expense,
        });
    }

    for (const key of ["income", "expense", "net"]) {
        monthlySheet.getColumn(key).numFmt = "#,##0";
    }

    monthlySheet.autoFilter = "A1:E1";

    for (const ws of [overviewSheet, monthlySheet]) {
        ws.getRow(1).font = {
            bold: true,
            color: { argb: "FFFFFFFF" },
        };

        ws.getRow(1).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF1E293B" },
        };

        ws.views = [
            { state: "frozen", ySplit: 1 },
        ];
    }

    const categoriesSheet = workbook.addWorksheet("Categories");

    categoriesSheet.columns = [
        { header: "Tháng", key: "month", width: 16 },
        { header: "Loại", key: "kind", width: 12 },
        { header: "Danh mục", key: "category", width: 25 },
        { header: "Tiền tệ", key: "currency", width: 14 },
        { header: "Số giao dịch", key: "count", width: 18 },
        { header: "Tổng số tiền", key: "amount", width: 24 },
    ];

    interface CategoryTotal {
        month: string;
        kind: string;
        category: string;
        currency: string;
        count: number;
        amount: number;
    }

    const categoryTotals = new Map<string, CategoryTotal>();

    for (const t of backup.transactions) {
        const account = accountMap.get(t.accountId)!;

        const month = t.date.slice(0, 7);

        const labels: Readonly<Record<string, string>> =
            categories[t.kind];

        const category =
            labels[t.categoryId ?? ""] ?? "Chưa phân loại";

        const key = JSON.stringify([
            month,
            t.kind,
            t.categoryId ?? "",
            account.currency,
        ]);

        let summary = categoryTotals.get(key);

        if (!summary) {
            summary = {
                month,
                kind: t.kind === "income" ? "Thu" : "Chi",
                category,
                currency: account.currency,
                count: 0,
                amount: 0,
            };

            categoryTotals.set(key, summary);
        }

        summary.count++;
        summary.amount += t.amountMinor;
    }

    const sortedCategories = [...categoryTotals.values()].sort(
        (a, b) =>
            a.month.localeCompare(b.month) ||
            a.currency.localeCompare(b.currency) ||
            a.kind.localeCompare(b.kind) ||
            b.amount - a.amount
    );

    for (const summary of sortedCategories) {
        categoriesSheet.addRow(summary);
    }

    categoriesSheet.getColumn("amount").numFmt = "#,##0";
    categoriesSheet.autoFilter = "A1:F1";

    const moneyFormat = "#,##0;[Red]-#,##0;0";

    for (const ws of workbook.worksheets) {
        const header = ws.getRow(1);

        header.fill = {
            type: "pattern",
            pattern: "none",
        };

        header.height = 26;

        for (let col = 1; col <= ws.columns.length; col++) {
            const cell = header.getCell(col);

            cell.font = {
                name: "Calibri",
                bold: true,
                color: { argb: "FFFFFFFF" },
            };

            cell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FF1E293B" },
            };

            cell.alignment = {
                vertical: "middle",
                horizontal: "left",
            };
        }

        ws.views = [
            {
                state: "frozen",
                ySplit: 1,
                showGridLines: false,
            },
        ];

        ws.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;

            row.height = 21;

            row.eachCell(cell => {
                cell.alignment = {
                    vertical: "middle",
                };

                if (rowNumber % 2 === 0) {
                    cell.fill = {
                        type: "pattern",
                        pattern: "solid",
                        fgColor: { argb: "FFF1F5F9" },
                    };
                }
            });
        });

        for (const column of ws.columns) {
            if ([
                "balance",
                "net",
                "amount",
                "income",
                "expense",
            ].includes(column.key ?? "")) {
                column.numFmt = moneyFormat;
            }
        }
    }

    overviewSheet.properties.tabColor = {
        argb: "FF2563EB",
    };

    transactionsSheet.properties.tabColor = {
        argb: "FF16A34A",
    };

    transfersSheet.properties.tabColor = {
        argb: "FFF59E0B",
    };

    monthlySheet.properties.tabColor = {
        argb: "FF7C3AED",
    };

    categoriesSheet.properties.tabColor = {
        argb: "FF0891B2",
    };

    const buffer = await workbook.xlsx.writeBuffer();
    const bytes = new Uint8Array(buffer);

    return new Blob([bytes.buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
}