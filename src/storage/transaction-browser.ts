import type { Account } from "../domain/finance/account";
import type { Transaction } from "../domain/finance/transaction";
import { toMovement } from "../domain/finance/transaction.js";
import { calculateBalance } from "../domain/finance/balance.js";
import { openDatabase } from "./database.js";
import { createTransfer, transferMovement } from "../domain/finance/transfer.js";
import type { Transfer } from "../domain/finance/transfer";
import { categories } from "../domain/finance/category.js";
import { summarizeMonth } from "../domain/finance/monthly-summary.js";
import { changeCategory } from "./change-category.js";
import { deleteTransaction } from "./delete-transaction.js";
import { deleteTransfer } from "./delete-transfer.js";
import { updateTransaction } from "./update-transaction.js";
import { updateTransfer } from "./update-transfer.js";
import { createBackup } from "./backup.js";

import {
    getAccountBalance,
    getReportTransactions,
} from "../domain/finance/ledger.js";

import {
    loanCashMovement,
    paymentCashMovement,
} from "../domain/finance/debt.js";

const accountSelect = document.querySelector<HTMLSelectElement>("#account")!;
const form = document.querySelector<HTMLFormElement>("#entry")!;
const kindSelect = form.querySelector<HTMLSelectElement>('select[name="kind"]')!;
const categorySelect = form.querySelector<HTMLSelectElement>("#entry-category")!;
const dateInput = document.querySelector<HTMLInputElement>("#date")!;
const save = document.querySelector<HTMLButtonElement>("#save")!;
const balance = document.querySelector<HTMLElement>("#balance")!;
const historyList = document.querySelector<HTMLUListElement>("#history")!;
const status = document.querySelector<HTMLElement>("#status")!;

function today(): string {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${month}-${day}`;
}

function read<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function saveEntry(db: IDBDatabase, entry: Transaction): Promise<void> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction("transactions", "readwrite");
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error ?? new Error("Ghi giao dịch thất bại."));
        tx.objectStore("transactions").add(entry);
    });
}

function updateCategories() {
    const kind = kindSelect.value === "income" ? "income" : "expense";
    categorySelect.replaceChildren();

    for (const [id, label] of Object.entries(categories[kind])) {
        categorySelect.add(new Option(label, id));
    }
}

kindSelect.onchange = updateCategories;
updateCategories();

async function start() {
    const db = await openDatabase();
    const accounts: Account[] = await read(
        db.transaction("accounts").objectStore("accounts").getAll(),
    );

    for (const account of accounts) {
        accountSelect.add(new Option(`${account.name} · ${account.currency}`, account.id));
    }

    if (!accounts.length) {
        status.textContent = "Hãy tạo tài khoản trước khi nhập thu chi.";
        return;
    }

    dateInput.value = today();
    dateInput.max = today();

    function selectedAccount(): Account {
        return accounts.find((account) => account.id === accountSelect.value)!;
    }
    const transferForm = document.querySelector<HTMLFormElement>("#transfer-form")!;
    const destination = document.querySelector<HTMLSelectElement>("#transfer-to")!;
    const transferDate = document.querySelector<HTMLInputElement>("#transfer-date")!;
    const transferSave = document.querySelector<HTMLButtonElement>("#transfer-save")!;
    let savingTransfer = false;

    transferDate.value = today();
    transferDate.max = today();

    function updateDestinations() {
        const source = selectedAccount();
        destination.replaceChildren();

        for (const account of accounts) {
            if (account.id !== source.id && account.currency === source.currency) {
                destination.add(new Option(`${account.name} · ${account.currency}`, account.id));
            }
        }

        transferSave.disabled = savingTransfer || destination.length === 0;

        if (destination.length === 0) {
            destination.add(new Option("Cần thêm tài khoản cùng loại tiền", ""));
        }
    }

    updateDestinations();

    transferForm.onsubmit = async (event) => {
        event.preventDefault();
        if (savingTransfer) return;

        const source = selectedAccount();
        const target = accounts.find((account) => account.id === destination.value);
        if (!target) return;

        const date = transferDate.value;
        if (date < source.openingBalanceDate || date < target.openingBalanceDate || date > today()) {
            status.textContent = "Chọn ngày từ khi cả hai tài khoản bắt đầu theo dõi đến hôm nay.";
            return;
        }

        const data = new FormData(transferForm);
        savingTransfer = true;
        transferSave.disabled = true;

        try {
            const transfer = createTransfer(
                source,
                target,
                Number(data.get("amount")),
                date,
                String(data.get("note") ?? "").trim(),
            );

            await new Promise<void>((resolve, reject) => {
                const tx = db.transaction("transfers", "readwrite");
                tx.oncomplete = () => resolve();
                tx.onabort = () => reject(tx.error ?? new Error("Lưu chuyển tiền thất bại."));
                tx.objectStore("transfers").add(transfer);
            });

            transferForm.reset();
            transferDate.value = today();
            status.textContent = `Đã chuyển từ ${source.name} sang ${target.name}.`;
            await refresh().catch(reportReadError);
        } catch (error) {
            status.textContent = error instanceof Error ? error.message : "Không lưu được.";
        } finally {
            savingTransfer = false;
            updateDestinations();
        }
    };

    const reportMonth = document.querySelector<HTMLInputElement>("#report-month")!;
    const reportTotals = document.querySelector<HTMLElement>("#report-totals")!;
    const reportBody = document.querySelector<HTMLTableSectionElement>("#report-categories")!;

    reportMonth.value = today().slice(0, 7);

    function renderReport(entries: Transaction[], account: Account) {
        reportBody.replaceChildren();

        if (!reportMonth.value) {
            reportTotals.textContent = "Chọn tháng để xem báo cáo.";
            return;
        }

        const summary = summarizeMonth(entries, account.id, reportMonth.value);
        const money = (amount: number) =>
            `${amount.toLocaleString("vi-VN")} ${account.currency}`;

        reportTotals.textContent =
            `Thu: ${money(summary.income)} · Chi: ${money(summary.expense)} · ` +
            `Chênh lệch: ${money(summary.net)}`;

        const labels: Readonly<Record<string, string>> = categories.expense;
        const sorted = [...summary.expenseByCategory].sort((a, b) => b[1] - a[1]);

        for (const [categoryId, amount] of sorted) {
            const row = reportBody.insertRow();
            row.insertCell().textContent = labels[categoryId] ?? "Chưa phân loại";
            row.insertCell().textContent = money(amount);
        }

        if (sorted.length === 0) {
            const cell = reportBody.insertRow().insertCell();
            cell.colSpan = 2;
            cell.textContent = "Tháng này chưa có khoản chi.";
        }
    }

    reportMonth.onchange = () => {
        void refresh().catch(reportReadError);
    };

    const editDialog =
        document.querySelector<HTMLDialogElement>("#edit-dialog")!;

    const editForm =
        document.querySelector<HTMLFormElement>("#edit-form")!;

    const editKind =
        document.querySelector<HTMLSelectElement>("#edit-kind")!;

    const editCategory =
        document.querySelector<HTMLSelectElement>("#edit-category")!;

    const editDate =
        document.querySelector<HTMLInputElement>("#edit-date")!;

    const editStatus =
        document.querySelector<HTMLElement>("#edit-status")!;

    const editSave =
        document.querySelector<HTMLButtonElement>("#edit-save")!;

    const editCancel =
        document.querySelector<HTMLButtonElement>("#edit-cancel")!;

    let editingEntry: Transaction | null = null;
    let savingEdit = false;

    function updateEditCategories() {
        const kind = editKind.value === "income"
            ? "income"
            : "expense";

        editCategory.replaceChildren();

        editCategory.add(
            new Option("Chưa phân loại", "")
        );

        for (const [id, label] of Object.entries(categories[kind])) {
            editCategory.add(new Option(label, id));
        }
    }

    editKind.onchange = updateEditCategories;

    function openEdit(entry: Transaction) {
        editingEntry = entry;

        const account = accounts.find(
            a => a.id === entry.accountId
        )!;

        editKind.value = entry.kind;

        updateEditCategories();

        editCategory.value = entry.categoryId ?? "";

        editForm.querySelector<HTMLInputElement>(
            '[name="amount"]'
        )!.value = String(entry.amountMinor);

        editForm.querySelector<HTMLInputElement>(
            '[name="note"]'
        )!.value = entry.note;

        editDate.min = account.openingBalanceDate;
        editDate.max = today();
        editDate.value = entry.date;

        editStatus.textContent = "";

        editDialog.showModal();
    }

    editCancel.onclick = () => {
        if (!savingEdit) editDialog.close();
    };

    editDialog.oncancel = (event) => {
        if (savingEdit) event.preventDefault();
    };

    editForm.onsubmit = async (event) => {
        event.preventDefault();

        if (!editingEntry || savingEdit) return;

        const data = new FormData(editForm);

        const kind = editKind.value === "income"
            ? "income"
            : "expense";

        const categoryId = (
            editCategory.value || undefined
        ) as Transaction["categoryId"];

        savingEdit = true;
        editSave.disabled = true;
        editCancel.disabled = true;
        editStatus.textContent = "Đang lưu...";

        try {
            await updateTransaction(
                db,
                editingEntry,
                {
                    kind,
                    categoryId,
                    amountMinor: Number(data.get("amount")),
                    date: editDate.value,
                    note: String(data.get("note") ?? "").trim(),
                },
                today()
            );

            editingEntry = null;
            editDialog.close();

            status.textContent = "Đã cập nhật giao dịch.";

            await refresh().catch(reportReadError);

        } catch (error) {
            editStatus.textContent =
                error instanceof Error
                    ? error.message
                    : "Không cập nhật được giao dịch.";

        } finally {
            savingEdit = false;
            editSave.disabled = false;
            editCancel.disabled = false;
        }
    };

    const editTransferDialog =
        document.querySelector<HTMLDialogElement>(
            "#edit-transfer-dialog"
        )!;

    const editTransferForm =
        document.querySelector<HTMLFormElement>(
            "#edit-transfer-form"
        )!;

    const editTransferRoute =
        document.querySelector<HTMLElement>(
            "#edit-transfer-route"
        )!;

    const editTransferDate =
        document.querySelector<HTMLInputElement>(
            "#edit-transfer-date"
        )!;

    const editTransferStatus =
        document.querySelector<HTMLElement>(
            "#edit-transfer-status"
        )!;

    const editTransferSave =
        document.querySelector<HTMLButtonElement>(
            "#edit-transfer-save"
        )!;

    const editTransferCancel =
        document.querySelector<HTMLButtonElement>(
            "#edit-transfer-cancel"
        )!;

    let editingTransfer: Transfer | null = null;
    let savingTransferEdit = false;

    function openTransferEdit(transfer: Transfer) {
        const from = accounts.find(
            a => a.id === transfer.fromAccountId
        );

        const to = accounts.find(
            a => a.id === transfer.toAccountId
        );

        if (!from || !to) {
            status.textContent = "Không tìm thấy tài khoản.";
            return;
        }

        editingTransfer = transfer;

        editTransferRoute.textContent =
            `${from.name} → ${to.name} · ${transfer.currency}`;

        editTransferForm.querySelector<HTMLInputElement>(
            '[name="amount"]'
        )!.value = String(transfer.amountMinor);

        editTransferForm.querySelector<HTMLInputElement>(
            '[name="note"]'
        )!.value = transfer.note;

        editTransferDate.min =
            from.openingBalanceDate > to.openingBalanceDate
                ? from.openingBalanceDate
                : to.openingBalanceDate;

        editTransferDate.max = today();
        editTransferDate.value = transfer.date;

        editTransferStatus.textContent = "";

        editTransferDialog.showModal();
    }

    editTransferCancel.onclick = () => {
        if (!savingTransferEdit) {
            editTransferDialog.close();
        }
    };

    editTransferDialog.oncancel = (event) => {
        if (savingTransferEdit) {
            event.preventDefault();
        }
    };

    editTransferForm.onsubmit = async (event) => {
        event.preventDefault();

        if (!editingTransfer || savingTransferEdit) return;

        const data = new FormData(editTransferForm);

        savingTransferEdit = true;
        editTransferSave.disabled = true;
        editTransferCancel.disabled = true;

        editTransferStatus.textContent = "Đang lưu...";

        try {
            await updateTransfer(
                db,
                editingTransfer,
                {
                    amountMinor: Number(data.get("amount")),
                    date: editTransferDate.value,
                    note: String(data.get("note") ?? "").trim(),
                },
                today()
            );

            editingTransfer = null;

            editTransferDialog.close();

            status.textContent =
                "Đã cập nhật khoản chuyển tiền.";

            await refresh().catch(reportReadError);

        } catch (error) {
            editTransferStatus.textContent =
                error instanceof Error
                    ? error.message
                    : "Không cập nhật được khoản chuyển.";

        } finally {
            savingTransferEdit = false;
            editTransferSave.disabled = false;
            editTransferCancel.disabled = false;
        }
    };

    async function refresh() {
        const account = selectedAccount();
        dateInput.min = account.openingBalanceDate;

        const backup = await createBackup(db);

        if (accountSelect.value !== account.id) return;

        const entries = backup.transactions.filter(
            t => t.accountId === account.id
        );

        const accountTransfers = backup.transfers.filter(
            t =>
                t.fromAccountId === account.id ||
                t.toAccountId === account.id
        );

        const reportEntries = getReportTransactions(backup);

        renderReport(reportEntries, account);

        const isCard = account.kind === "credit_card";

        const current = getAccountBalance(
            account,
            backup
        );

        const money = (n: number) => `${n.toLocaleString("vi-VN")} ${account.currency}`;

        balance.textContent = `${isCard ? "Dư nợ" : "Số dư"}: ${money(current)}`;
        historyList.replaceChildren();

        const rows: {
            date: string;
            text: string;
            entry?: Transaction;
            transfer?: Transfer;
        }[] = entries.map((entry) => {
            const label = entry.kind === "expense" ? "Chi" : "Thu";
            const labels: Readonly<Record<string, string>> = categories[entry.kind];
            const category = labels[entry.categoryId ?? ""] ?? "Chưa phân loại";

            return {
                entry,
                date: entry.date,
                text: `${label} ${money(entry.amountMinor)} · ${category} · ${entry.note}`,
            };
        });

        for (const transfer of accountTransfers) {
            const sent = transfer.fromAccountId === account.id;
            const otherId = sent ? transfer.toAccountId : transfer.fromAccountId;
            const otherName = accounts.find((item) => item.id === otherId)?.name ?? otherId;
            const direction = sent ? `Chuyển đến ${otherName}` : `Nhận từ ${otherName}`;
            const note = transfer.note ? ` · ${transfer.note}` : "";

            rows.push({
                transfer,
                date: transfer.date,
                text: `${direction} · ${money(transfer.amountMinor)}${note}`,
            });
        }

        const loanMap = new Map(
            backup.loans.map(loan => [loan.id, loan])
        );

        for (const loan of backup.loans) {
            if (loan.accountId !== account.id) continue;

            const movement = loanCashMovement(
                loan,
                account.id
            );

            const label = loan.direction === "borrowed"
                ? "Nhận tiền vay"
                : "Cho vay";

            rows.push({
                date: loan.startDate,
                text:
                    `${label} · ${money(movement)} · ` +
                    `${loan.counterparty}`,
            });
        }

        for (const payment of backup.loanPayments) {
            if (payment.accountId !== account.id) continue;

            const loan = loanMap.get(payment.loanId);

            if (!loan) continue;

            const movement = paymentCashMovement(
                loan,
                payment,
                account.id
            );

            const label = loan.direction === "borrowed"
                ? "Trả nợ"
                : "Thu hồi nợ";

            rows.push({
                date: payment.date,
                text:
                    `${label} · ${money(movement)} · ` +
                    `${loan.counterparty} · ` +
                    `Gốc: ${money(payment.principalMinor)} · ` +
                    `Lãi: ${money(payment.interestMinor)} · ` +
                    `Phí: ${money(payment.feeMinor)}`,
            });
        }

        rows.sort((a, b) => b.date.localeCompare(a.date));

        for (const row of rows) {
            const li = document.createElement("li");
            li.textContent = `${row.date} · ${row.text}`;
            const entry = row.entry;

            if (entry) {
                const select = document.createElement("select");
                select.setAttribute("aria-label", `Đổi danh mục cho ${entry.note}`);

                const placeholder = new Option("Chưa phân loại", "");
                placeholder.disabled = true;
                select.add(placeholder);

                for (const [id, label] of Object.entries(categories[entry.kind])) {
                    select.add(new Option(label, id));
                }

                select.value = entry.categoryId ?? "";

                select.onchange = async () => {
                    const categoryId = select.value as NonNullable<Transaction["categoryId"]>;
                    select.disabled = true;

                    try {
                        await changeCategory(db, entry.id, categoryId);
                    } catch (error) {
                        select.value = entry.categoryId ?? "";
                        select.disabled = false;
                        status.textContent = error instanceof Error ? error.message : "Đổi danh mục thất bại.";
                        return;
                    }

                    status.textContent = "Đã cập nhật danh mục.";
                    await refresh().catch(reportReadError);
                };

                li.append(" ", select);

                const editButton = document.createElement("button");

                editButton.type = "button";
                editButton.textContent = "Sửa";
                editButton.style.color = "#2563eb";
                editButton.style.marginLeft = "8px";

                editButton.onclick = () => {
                    openEdit(entry);
                };

                li.append(editButton);

                const deleteButton = document.createElement("button");

                deleteButton.type = "button";
                deleteButton.textContent = "Xóa";
                deleteButton.style.color = "#dc2626";
                deleteButton.style.marginLeft = "8px";

                deleteButton.onclick = async () => {
                    const confirmed = window.confirm(
                        `Xóa giao dịch "${entry.note}"?\n` +
                        `Số tiền: ${money(entry.amountMinor)}\n\n` +
                        "Hành động này không thể hoàn tác."
                    );

                    if (!confirmed) return;

                    deleteButton.disabled = true;
                    select.disabled = true;

                    try {
                        await deleteTransaction(db, entry);

                        status.textContent = "Đã xóa giao dịch.";

                        await refresh().catch(reportReadError);

                    } catch (error) {
                        status.textContent =
                            error instanceof Error
                                ? error.message
                                : "Xóa giao dịch thất bại.";

                        deleteButton.disabled = false;
                        select.disabled = false;
                    }
                };

                li.append(deleteButton);
            }
            if (row.transfer) {
                const transfer = row.transfer;

                const editButton = document.createElement("button");

                editButton.type = "button";
                editButton.textContent = "Sửa";
                editButton.style.color = "#2563eb";
                editButton.style.marginLeft = "8px";

                editButton.onclick = () => {
                    openTransferEdit(transfer);
                };

                li.append(editButton);

                const fromName = accounts.find(
                    a => a.id === transfer.fromAccountId
                )?.name ?? transfer.fromAccountId;

                const toName = accounts.find(
                    a => a.id === transfer.toAccountId
                )?.name ?? transfer.toAccountId;

                const deleteButton = document.createElement("button");

                deleteButton.type = "button";
                deleteButton.textContent = "Xóa";
                deleteButton.style.color = "#dc2626";
                deleteButton.style.marginLeft = "8px";

                deleteButton.onclick = async () => {
                    const confirmed = window.confirm(
                        `Xóa khoản chuyển tiền?\n\n` +
                        `Nguồn: ${fromName}\n` +
                        `Đích: ${toName}\n` +
                        `Số tiền: ${money(transfer.amountMinor)}\n\n` +
                        "Số dư cả hai tài khoản sẽ thay đổi.\n" +
                        "Hành động này không thể hoàn tác."
                    );

                    if (!confirmed) return;

                    deleteButton.disabled = true;

                    try {
                        await deleteTransfer(db, transfer);

                        status.textContent = "Đã xóa khoản chuyển tiền.";

                        await refresh().catch(reportReadError);

                    } catch (error) {
                        status.textContent =
                            error instanceof Error
                                ? error.message
                                : "Xóa khoản chuyển tiền thất bại.";

                        deleteButton.disabled = false;
                    }
                };

                li.append(deleteButton);
            }
            historyList.append(li);
        }
    }

    function reportReadError() {
        status.textContent = "Không đọc được sổ giao dịch. Hãy tải lại trang.";
    }

    accountSelect.onchange = () => {
        updateDestinations();
        status.textContent = "";
        void refresh().catch(reportReadError);
    };
    form.onsubmit = async (event) => {
        event.preventDefault();
        if (save.disabled) return;

        const data = new FormData(form);
        const amount = Number(data.get("amount"));
        const note = String(data.get("note") ?? "").trim();
        const kind = data.get("kind");

        if (!Number.isSafeInteger(amount) || amount <= 0 || !note) {
            status.textContent = "Nhập số tiền nguyên dương và nội dung giao dịch.";
            return;
        }
        if (kind !== "income" && kind !== "expense") return;
        const categoryId = categorySelect.value as NonNullable<Transaction["categoryId"]>;

        if (!Object.hasOwn(categories[kind], categoryId)) {
            status.textContent = "Chọn danh mục phù hợp với loại giao dịch.";
            return;
        }

        const entry: Transaction = {
            id: crypto.randomUUID(),
            accountId: selectedAccount().id,
            kind,
            categoryId,
            amountMinor: amount,
            date: dateInput.value,
            note,
        };

        save.disabled = true;
        try {
            await saveEntry(db, entry);
            form.reset();
            updateCategories();
            dateInput.value = today();
            status.textContent = "Đã lưu giao dịch.";
            await refresh().catch(reportReadError);
        } catch {
            status.textContent = "Chưa lưu được. M thử lại nhé.";
        } finally {
            save.disabled = false;
        }
    };

    await refresh();
    save.disabled = false;
}

start().catch(() => {
    status.textContent = "Không mở được dữ liệu. Hãy tải lại trang.";
});