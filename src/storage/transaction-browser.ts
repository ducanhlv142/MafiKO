import type { Account } from "../domain/finance/account";
import type { Transaction } from "../domain/finance/transaction";
import { toMovement } from "../domain/finance/transaction.js";
import { calculateBalance } from "../domain/finance/balance.js";
import { openDatabase } from "./database.js";
import { createTransfer, transferMovement } from "../domain/finance/transfer.js";
import type { Transfer } from "../domain/finance/transfer";
import { categories } from "../domain/finance/category.js";

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

    async function refresh() {
        const account = selectedAccount();
        dateInput.min = account.openingBalanceDate;

        const store = db.transaction("transactions").objectStore("transactions");
        const tx = db.transaction(["transactions", "transfers"], "readonly");
        const transfers = tx.objectStore("transfers");

        const [entries, outgoing, incoming]: [Transaction[], Transfer[], Transfer[]] =
            await Promise.all([
                read(tx.objectStore("transactions").index("byAccount").getAll(account.id)),
                read(transfers.index("bySource").getAll(account.id)),
                read(transfers.index("byDestination").getAll(account.id)),
            ]);

        if (accountSelect.value !== account.id) return;

        const isCard = account.kind === "credit_card";
        const changes = entries.map((entry) =>
            isCard ? -toMovement(entry) : toMovement(entry),
        );

        const accountTransfers = [...outgoing, ...incoming];

        for (const transfer of accountTransfers) {
            const movement = transferMovement(transfer, account.id);
            changes.push(isCard ? -movement : movement);
        }
        const current = calculateBalance(account.openingBalanceMinor, changes);

        const money = (n: number) => `${n.toLocaleString("vi-VN")} ${account.currency}`;

        balance.textContent = `${isCard ? "Dư nợ" : "Số dư"}: ${money(current)}`;
        historyList.replaceChildren();

        const rows = entries.map((entry) => {
            const label = entry.kind === "expense" ? "Chi" : "Thu";
            const labels: Readonly<Record<string, string>> = categories[entry.kind];
            const category = labels[entry.categoryId ?? ""] ?? "Chưa phân loại";

            return {
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
                date: transfer.date,
                text: `${direction} · ${money(transfer.amountMinor)}${note}`,
            });
        }

        rows.sort((a, b) => b.date.localeCompare(a.date));

        for (const row of rows) {
            const li = document.createElement("li");
            li.textContent = `${row.date} · ${row.text}`;
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