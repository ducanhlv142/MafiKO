import type { Account } from "../domain/finance/account";
import type { Transaction } from "../domain/finance/transaction";
import { toMovement } from "../domain/finance/transaction.js";
import { calculateBalance } from "../domain/finance/balance.js";
import { openDatabase } from "./database.js";

const accountSelect = document.querySelector<HTMLSelectElement>("#account")!;
const form = document.querySelector<HTMLFormElement>("#entry")!;
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

  async function refresh() {
    const account = selectedAccount();
    dateInput.min = account.openingBalanceDate;

    const store = db.transaction("transactions").objectStore("transactions");
    const entries: Transaction[] = await read(
      store.index("byAccount").getAll(account.id),
    );

    // Nếu vừa đổi tài khoản trong lúc đọc, bỏ qua kết quả cũ.
    if (accountSelect.value !== account.id) return;

    const isCard = account.kind === "credit_card";
    const changes = entries.map((entry) =>
      isCard ? -toMovement(entry) : toMovement(entry),
    );
    const current = calculateBalance(account.openingBalanceMinor, changes);
    const money = (n: number) => `${n.toLocaleString("vi-VN")} ${account.currency}`;

    balance.textContent = `${isCard ? "Dư nợ" : "Số dư"}: ${money(current)}`;
    historyList.replaceChildren();

    entries.sort((a, b) => b.date.localeCompare(a.date));
    for (const entry of entries) {
      const row = document.createElement("li");
      const label = entry.kind === "expense" ? "Chi" : "Thu";
      row.textContent = `${entry.date} · ${label} ${money(entry.amountMinor)} · ${entry.note}`;
      historyList.append(row);
    }
  }

  function reportReadError() {
    status.textContent = "Không đọc được sổ giao dịch. Hãy tải lại trang.";
  }

  accountSelect.onchange = () => {
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

    const entry: Transaction = {
      id: crypto.randomUUID(),
      accountId: selectedAccount().id,
      kind,
      amountMinor: amount,
      date: dateInput.value,
      note,
    };

    save.disabled = true;
    try {
      await saveEntry(db, entry);
      form.reset();
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