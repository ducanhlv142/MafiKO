import type { FinanceBackup } from "./backup";
import { categories } from "../domain/finance/category.js";
import { calculateBalance } from "../domain/finance/balance.js";
import { toMovement } from "../domain/finance/transaction.js";
import { transferMovement } from "../domain/finance/transfer.js";
import { summarizeBudget } from "../domain/finance/budget.js";
import {
    getAccountBalance,
    getReportTransactions,
    getLoanNetValue,
    getSavingsNetValue,
} from "../domain/finance/ledger.js";
import {
    summarizeLoan,
    paymentTotal,
} from "../domain/finance/debt.js";

import {
    estimateLoanInterest,
    getLoanMaturity,
} from "../domain/finance/loan-interest.js";

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

    const reportTransactions =
        getReportTransactions(backup);

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

        const balance = getAccountBalance(
            account,
            backup
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

    for (const loan of backup.loans) {
        const net = getLoanNetValue(
            loan,
            backup.loanPayments
        );

        const label = loan.direction === "borrowed"
            ? "Nợ phải trả"
            : "Khoản phải thu";

        overviewSheet.addRow({
            account: loan.counterparty,
            kind: label,
            currency: loan.currency,
            balance: Math.abs(net),
            net,
        });

        currencyTotals.set(
            loan.currency,
            (currencyTotals.get(loan.currency) ?? 0) + net
        );
    }

    for (const plan of backup.savingsPlans) {

        const net = getSavingsNetValue(
            plan,
            backup.savingsMovements
        );

        const label = plan.kind === "fixed"
            ? "Tiền gửi có kỳ hạn"
            : "Tiết kiệm linh hoạt";

        overviewSheet.addRow({
            account: plan.name,

            kind: label,

            currency: plan.currency,

            balance: net,

            net,
        });

        currencyTotals.set(
            plan.currency,

            (currencyTotals.get(plan.currency) ?? 0) +
            net
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

    for (const t of reportTransactions) {
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

    for (const t of reportTransactions) {
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

    const budgetsSheet = workbook.addWorksheet("Budgets");

    budgetsSheet.columns = [
        { header: "ID", key: "id", width: 38 },
        { header: "Tháng", key: "month", width: 16 },
        { header: "Tiền tệ", key: "currency", width: 14 },
        { header: "Danh mục", key: "category", width: 25 },
        { header: "Hạn mức", key: "limit", width: 22 },
        { header: "Đã sử dụng", key: "spent", width: 22 },
        { header: "Còn lại", key: "remaining", width: 22 },
        { header: "Sử dụng (%)", key: "usage", width: 18 },
        { header: "Trạng thái", key: "status", width: 25 },
    ];

    const budgetStatusLabels = {
        normal: "Trong hạn mức",
        warning: "Sắp vượt",
        reached: "Hết ngân sách",
        exceeded: "Vượt ngân sách",
    };

    const budgetStatusColors = {
        normal: "FF15803D",
        warning: "FFB45309",
        reached: "FFDC2626",
        exceeded: "FFDC2626",
    };

    const sortedBudgets = [...backup.budgets].sort(
        (a, b) =>
            a.month.localeCompare(b.month) ||
            a.currency.localeCompare(b.currency) ||
            a.categoryId.localeCompare(b.categoryId)
    );

    for (const budget of sortedBudgets) {
        const summary = summarizeBudget(
            budget,
            backup.accounts,
            reportTransactions
        );

        const row = budgetsSheet.addRow({
            id: budget.id,
            month: budget.month,
            currency: budget.currency,
            category: categories.expense[budget.categoryId],
            limit: budget.limitMinor,
            spent: summary.spentMinor,
            remaining: summary.remainingMinor,
            usage: summary.usagePercent / 100,
            status: budgetStatusLabels[summary.status],
        });

        row.getCell("status").font = {
            bold: true,
            color: {
                argb: budgetStatusColors[summary.status],
            },
        };
    }

    budgetsSheet.getColumn("usage").numFmt = "0.0%";

    budgetsSheet.autoFilter = "A1:I1";

    const reportDate = new Date(backup.exportedAt);

    const reportDay =
        `${reportDate.getFullYear()}-` +
        `${String(reportDate.getMonth() + 1).padStart(2, "0")}-` +
        `${String(reportDate.getDate()).padStart(2, "0")}`;

    const loansSheet = workbook.addWorksheet("Loans");

    loansSheet.columns = [
        { header: "ID", key: "id", width: 40 },
        { header: "Loại", key: "direction", width: 18 },
        { header: "Đối tác", key: "counterparty", width: 28 },
        { header: "ID tài khoản", key: "accountId", width: 40 },
        { header: "Tài khoản", key: "account", width: 25 },
        { header: "Tiền tệ", key: "currency", width: 12 },
        { header: "Ngày bắt đầu", key: "startDate", width: 18 },
        { header: "Ngày đáo hạn", key: "dueDate", width: 18 },
        { header: "Tiền gốc", key: "principal", width: 20 },
        { header: "Gốc đã thanh toán", key: "principalPaid", width: 22 },
        { header: "Gốc còn lại", key: "remaining", width: 22 },
        { header: "Lãi suất năm", key: "rate", width: 18 },
        { header: "Tiến độ trả gốc", key: "progress", width: 22 },
        { header: "Lãi đã thanh toán", key: "interestPaid", width: 24 },
        { header: "Phí đã thanh toán", key: "feePaid", width: 24 },
        { header: "Tổng thanh toán", key: "totalPaid", width: 22 },
        { header: "Ngày ước tính", key: "asOf", width: 18 },
        { header: "Lãi ước tính", key: "estimatedInterest", width: 22 },
        { header: "Lãi còn lại ước tính", key: "unpaidInterest", width: 26 },
        { header: "Trạng thái", key: "status", width: 30 },
        { header: "Ghi chú", key: "note", width: 40 },
    ];

    const maturityColors = {
        notStarted: "FF64748B",
        settled: "FF15803D",
        noDueDate: "FF64748B",
        active: "FF15803D",
        dueSoon: "FFB45309",
        dueToday: "FFDC2626",
        overdue: "FFDC2626",
    };

    const sortedLoans = [...backup.loans].sort(
        (a, b) =>
            a.currency.localeCompare(b.currency) ||
            a.direction.localeCompare(b.direction) ||
            b.startDate.localeCompare(a.startDate)
    );

    for (const loan of sortedLoans) {
        const account = accountMap.get(loan.accountId);

        if (!account) {
            throw new Error(
                `Khoản vay ${loan.id} thiếu tài khoản.`
            );
        }

        const summary = summarizeLoan(
            loan,
            backup.loanPayments
        );

        const interest = estimateLoanInterest(
            loan,
            backup.loanPayments,
            reportDay
        );

        const maturity = getLoanMaturity(
            loan,
            backup.loanPayments,
            reportDay
        );

        const row = loansSheet.addRow({
            id: loan.id,

            direction:
                loan.direction === "borrowed"
                    ? "Vay"
                    : "Cho vay",

            counterparty: loan.counterparty,

            accountId: loan.accountId,
            account: account.name,
            currency: loan.currency,

            startDate: loan.startDate,
            dueDate: loan.dueDate ?? "",

            principal: loan.principalMinor,
            principalPaid: summary.principalPaidMinor,
            remaining: summary.remainingPrincipalMinor,

            rate: loan.annualRateBps / 10000,

            progress:
                summary.principalPaidMinor /
                loan.principalMinor,

            interestPaid: summary.interestPaidMinor,
            feePaid: summary.feePaidMinor,
            totalPaid: summary.totalPaidMinor,

            asOf: reportDay,

            estimatedInterest:
                interest.estimatedInterestMinor,

            unpaidInterest:
                interest.estimatedUnpaidInterestMinor,

            status: maturity.label,

            note: loan.note,
        });

        row.getCell("status").font = {
            bold: true,
            color: {
                argb: maturityColors[maturity.status],
            },
        };

        row.getCell("direction").font = {
            bold: true,
            color: {
                argb: loan.direction === "borrowed"
                    ? "FFDC2626"
                    : "FF15803D",
            },
        };
    }

    loansSheet.getColumn("rate").numFmt = "0.00%";

    loansSheet.getColumn("progress").numFmt = "0.0%";

    loansSheet.autoFilter = "A1:U1";

    const paymentsSheet =
        workbook.addWorksheet("Loan Payments");

    paymentsSheet.columns = [
        { header: "ID", key: "id", width: 40 },
        { header: "Loan ID", key: "loanId", width: 40 },
        { header: "Loại", key: "direction", width: 20 },
        { header: "Đối tác", key: "counterparty", width: 28 },
        { header: "ID tài khoản", key: "accountId", width: 40 },
        { header: "Tài khoản", key: "account", width: 25 },
        { header: "Tiền tệ", key: "currency", width: 12 },
        { header: "Ngày thanh toán", key: "date", width: 18 },
        { header: "Tiền gốc", key: "principal", width: 20 },
        { header: "Tiền lãi", key: "interest", width: 20 },
        { header: "Tiền phí", key: "fee", width: 20 },
        { header: "Tổng thanh toán", key: "totalPaid", width: 24 },
        { header: "Ghi chú", key: "note", width: 40 },
    ];

    const debtLoanMap = new Map(
        backup.loans.map(loan => [loan.id, loan])
    );

    const sortedPayments =
        [...backup.loanPayments].sort(
            (a, b) =>
                b.date.localeCompare(a.date) ||
                a.loanId.localeCompare(b.loanId) ||
                a.id.localeCompare(b.id)
        );

    for (const payment of sortedPayments) {
        const loan = debtLoanMap.get(payment.loanId);

        const account = accountMap.get(payment.accountId);

        if (!loan || !account) {
            throw new Error(
                `Thanh toán ${payment.id} thiếu dữ liệu liên kết.`
            );
        }

        const row = paymentsSheet.addRow({
            id: payment.id,

            loanId: payment.loanId,

            direction:
                loan.direction === "borrowed"
                    ? "Trả nợ"
                    : "Thu hồi nợ",

            counterparty: loan.counterparty,

            accountId: payment.accountId,
            account: account.name,
            currency: loan.currency,

            date: payment.date,

            principal: payment.principalMinor,
            interest: payment.interestMinor,
            fee: payment.feeMinor,

            totalPaid: paymentTotal(payment),

            note: payment.note,
        });

        row.getCell("direction").font = {
            bold: true,
            color: {
                argb: loan.direction === "borrowed"
                    ? "FFDC2626"
                    : "FF15803D",
            },
        };
    }

    paymentsSheet.autoFilter = "A1:M1";

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
                "limit",
                "spent",
                "remaining",
                "principal",
                "principalPaid",
                "interest",
                "interestPaid",
                "fee",
                "feePaid",
                "totalPaid",
                "estimatedInterest",
                "unpaidInterest",
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

    budgetsSheet.properties.tabColor = {
        argb: "FFDB2777",
    };

    loansSheet.properties.tabColor = {
        argb: "FFDC2626",
    };

    paymentsSheet.properties.tabColor = {
        argb: "FF0D9488",
    };

    const buffer = await workbook.xlsx.writeBuffer();
    const bytes = new Uint8Array(buffer);

    return new Blob([bytes.buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
}