import type { Account } from "../domain/finance/account";

import { categories } from "../domain/finance/category.js";
import {
    summarizeBudget,
    createBudget,
} from "../domain/finance/budget.js";

import { openDatabase } from "./database.js";
import { createBackup } from "./backup.js";
import type { Budget } from "../domain/finance/budget";
import type { ExpenseCategoryId } from "../domain/finance/category";

import {
    saveBudget,
    deleteBudget,
} from "./budget-storage.js";

const monthInput =
    document.querySelector<HTMLInputElement>("#budget-month")!;

const currencySelect =
    document.querySelector<HTMLSelectElement>("#budget-currency")!;

const totals =
    document.querySelector<HTMLElement>("#budget-totals")!;

const list =
    document.querySelector<HTMLTableSectionElement>("#budget-list")!;

const status =
    document.querySelector<HTMLElement>("#budget-status")!;

const spending =
    document.querySelector<HTMLElement>(
        "#budget-spending"
    )!;

const alerts =
    document.querySelector<HTMLUListElement>(
        "#budget-alerts"
    )!;

const statusColors = {
    normal: "#16a34a",
    warning: "#d97706",
    reached: "#dc2626",
    exceeded: "#dc2626",
};

function currentMonth(): string {
    const now = new Date();

    const month = String(
        now.getMonth() + 1
    ).padStart(2, "0");

    return `${now.getFullYear()}-${month}`;
}

const statusLabels = {
    normal: "Trong hạn mức",
    warning: "Sắp vượt",
    reached: "Hết ngân sách",
    exceeded: "Vượt ngân sách",
};

async function start() {
    const db = await openDatabase();

    monthInput.value = currentMonth();

    let refreshVersion = 0;

    const budgetForm =
        document.querySelector<HTMLFormElement>(
            "#budget-form"
        )!;

    const budgetCategory =
        document.querySelector<HTMLSelectElement>(
            "#budget-category"
        )!;

    const budgetLimit =
        document.querySelector<HTMLInputElement>(
            "#budget-limit"
        )!;

    const budgetSave =
        document.querySelector<HTMLButtonElement>(
            "#budget-save"
        )!;

    for (const [id, label] of Object.entries(categories.expense)) {
        budgetCategory.add(new Option(label, id));
    }

    let visibleBudgets = new Map<string, Budget>();

    let writing = false;
    let ready = false;

    async function refresh() {
        const version = ++refreshVersion;

        ready = false;
        budgetSave.disabled = true;
        visibleBudgets.clear();

        const month = monthInput.value;

        const currency =
            currencySelect.value as Account["currency"];

        list.replaceChildren();
        totals.textContent = "";
        alerts.replaceChildren();
        spending.textContent = "";
        status.textContent = "Đang đọc ngân sách...";

        if (!month) {
            status.textContent = "Hãy chọn tháng.";
            return;
        }

        const backup = await createBackup(db);

        if (version !== refreshVersion) return;

        const budgets = backup.budgets.filter(
            b => b.month === month &&
                b.currency === currency
        );

        const money = (value: number) =>
            `${value.toLocaleString("vi-VN")} ${currency}`;

        let totalLimit = 0;
        let totalSpent = 0;

        for (const budget of budgets) {
            const summary = summarizeBudget(
                budget,
                backup.accounts,
                backup.transactions
            );

            totalLimit += budget.limitMinor;
            totalSpent += summary.spentMinor;

            const row = list.insertRow();

            const values = [
                categories.expense[budget.categoryId],
                money(budget.limitMinor),
                money(summary.spentMinor),
                money(summary.remainingMinor),
                `${summary.usagePercent.toFixed(1)}%`,
                statusLabels[summary.status],
            ];

            for (const value of values) {
                row.insertCell().textContent = value;
            }

            const progressCell = row.cells[4];

            const progress = document.createElement("div");

            progress.className = "budget-progress";

            progress.setAttribute("role", "progressbar");
            progress.setAttribute("aria-label", "Mức sử dụng ngân sách");
            progress.setAttribute("aria-valuemin", "0");
            progress.setAttribute("aria-valuemax", "100");

            progress.setAttribute(
                "aria-valuenow",
                String(Math.min(100, summary.usagePercent))
            );

            progress.setAttribute(
                "aria-valuetext",
                `${summary.usagePercent.toFixed(1)}%`
            );

            const fill = document.createElement("div");

            fill.className = "budget-progress-fill";

            fill.style.width =
                `${Math.min(100, summary.usagePercent)}%`;

            fill.style.backgroundColor =
                statusColors[summary.status];

            progress.append(fill);

            progressCell.append(progress);

            row.cells[5].className =
                `budget-${summary.status}`;

            if (summary.remainingMinor < 0) {
                row.cells[3].classList.add("budget-negative");
            }

            if (summary.status !== "normal") {
                const item = document.createElement("li");

                const name =
                    categories.expense[budget.categoryId];

                item.className = `budget-${summary.status}`;

                switch (summary.status) {
                    case "warning":
                        item.textContent =
                            `${name}: Đã sử dụng ` +
                            `${summary.usagePercent.toFixed(1)}%. ` +
                            `Còn ${money(summary.remainingMinor)}.`;
                        break;

                    case "reached":
                        item.textContent =
                            `${name}: Đã sử dụng hết ngân sách.`;
                        break;

                    case "exceeded":
                        item.textContent =
                            `${name}: Vượt ngân sách ` +
                            `${money(-summary.remainingMinor)}.`;
                        break;
                }

                alerts.append(item);
            }

            const actions = row.insertCell();

            const editButton = document.createElement("button");

            editButton.type = "button";
            editButton.textContent = "Sửa";
            editButton.style.color = "#2563eb";

            editButton.onclick = () => {
                if (writing) return;

                budgetCategory.value = budget.categoryId;
                budgetLimit.value = String(budget.limitMinor);

                budgetLimit.focus();
            };

            const deleteButton = document.createElement("button");

            deleteButton.type = "button";
            deleteButton.textContent = "Xóa";
            deleteButton.style.color = "#dc2626";
            deleteButton.style.marginLeft = "8px";

            deleteButton.onclick = async () => {
                if (writing) return;

                const confirmed = window.confirm(
                    `Xóa ngân sách "${categories.expense[budget.categoryId]}"?\n\n` +
                    `Hạn mức: ${money(budget.limitMinor)}\n\n` +
                    "Các giao dịch thu chi vẫn được giữ nguyên."
                );

                if (!confirmed) return;

                await runBudgetWrite(
                    () => deleteBudget(db, budget),
                    "Đã xóa ngân sách."
                );
            };

            actions.append(editButton, deleteButton);
        }

        totals.textContent =
            `Hạn mức: ${money(totalLimit)} · ` +
            `Đã sử dụng: ${money(totalSpent)} · ` +
            `Còn lại: ${money(totalLimit - totalSpent)}`;

        const accountIds = new Set(
            backup.accounts
                .filter(a => a.currency === currency)
                .map(a => a.id)
        );

        const allExpenses = backup.transactions
            .filter(t =>
                t.kind === "expense" &&
                t.date.slice(0, 7) === month &&
                accountIds.has(t.accountId)
            )
            .reduce(
                (sum, t) => sum + t.amountMinor,
                0
            );

        const unbudgetedSpent =
            allExpenses - totalSpent;

        spending.textContent =
            `Tổng chi thực tế: ${money(allExpenses)} · ` +
            `Chi có ngân sách: ${money(totalSpent)} · ` +
            `Chi chưa có ngân sách: ${money(unbudgetedSpent)}`;

        if (unbudgetedSpent > 0) {
            const item = document.createElement("li");

            item.className = "budget-warning";

            item.textContent =
                `Có ${money(unbudgetedSpent)} chi tiêu ` +
                `chưa được lập ngân sách.`;

            alerts.append(item);
        }

        if (alerts.children.length === 0) {
            const item = document.createElement("li");

            item.className = "budget-normal";

            item.textContent = budgets.length === 0
                ? "Chưa thiết lập hạn mức ngân sách."
                : "Tất cả ngân sách đang trong hạn mức an toàn.";

            alerts.append(item);
        }

        if (budgets.length === 0) {
            const cell = list.insertRow().insertCell();

            cell.colSpan = 7;
            cell.textContent = "Chưa thiết lập ngân sách.";
        }

        status.textContent =
            `Có ${budgets.length} ngân sách.`;

        visibleBudgets = new Map(
            budgets.map(b => [b.id, b])
        );

        ready = true;
        budgetSave.disabled = writing;
    }

    function reportError(error: unknown) {
        status.textContent =
            error instanceof Error
                ? error.message
                : "Không đọc được ngân sách.";
    }

    async function runBudgetWrite(
        action: () => Promise<void>,
        successMessage: string,
    ) {
        if (writing) return;

        writing = true;

        budgetSave.disabled = true;
        monthInput.disabled = true;
        currencySelect.disabled = true;

        status.textContent = "Đang lưu dữ liệu...";

        try {
            await action();

            budgetLimit.value = "";

            try {
                await refresh();
                status.textContent = successMessage;
            } catch {
                status.textContent =
                    "Đã lưu nhưng chưa tải lại được dữ liệu.";
            }

        } catch (error) {
            await refresh().catch(reportError);
            reportError(error);

        } finally {
            writing = false;

            monthInput.disabled = false;
            currencySelect.disabled = false;
            budgetSave.disabled = !ready;
        }
    }

    budgetForm.onsubmit = async (event) => {
        event.preventDefault();

        if (writing || !ready) return;

        try {
            const budget = createBudget(
                monthInput.value,
                currencySelect.value as Account["currency"],
                budgetCategory.value as ExpenseCategoryId,
                Number(budgetLimit.value)
            );

            const existing = visibleBudgets.get(budget.id);

            if (existing) {
                const confirmed = window.confirm(
                    "Ngân sách này đã tồn tại.\n\n" +
                    `Hạn mức cũ: ${existing.limitMinor.toLocaleString("vi-VN")}\n` +
                    `Hạn mức mới: ${budget.limitMinor.toLocaleString("vi-VN")}\n\n` +
                    "Xác nhận cập nhật?"
                );

                if (!confirmed) return;
            }

            await runBudgetWrite(
                () => saveBudget(db, budget, existing),
                existing
                    ? "Đã cập nhật ngân sách."
                    : "Đã tạo ngân sách."
            );

        } catch (error) {
            reportError(error);
        }
    };

    monthInput.onchange = () => {
        void refresh().catch(reportError);
    };

    currencySelect.onchange = () => {
        void refresh().catch(reportError);
    };

    window.addEventListener("focus", () => {
        if (!writing) {
            void refresh().catch(reportError);
        }
    });

    document.addEventListener("visibilitychange", () => {
        if (
            document.visibilityState === "visible" &&
            !writing
        ) {
            void refresh().catch(reportError);
        }
    });

    await refresh();
}

start().catch(error => {
    status.textContent =
        error instanceof Error
            ? error.message
            : "Không mở được database.";
});