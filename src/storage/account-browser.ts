import type { Account } from "../domain/finance/account";
import { openDatabase } from "./database.js";

const form = document.querySelector<HTMLFormElement>("#account-form")!;
const dateInput = document.querySelector<HTMLInputElement>("#opening-date")!;
const saveButton = document.querySelector<HTMLButtonElement>("#save")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const list = document.querySelector<HTMLUListElement>("#accounts")!;

function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function showAccounts(db: IDBDatabase) {
  const request = db.transaction("accounts").objectStore("accounts").getAll();

  request.onsuccess = () => {
    const accounts: Account[] = request.result;
    list.replaceChildren();

    for (const account of accounts) {
      const item = document.createElement("li");
      const amount = account.openingBalanceMinor.toLocaleString("vi-VN");
      const label = account.kind === "credit_card" ? "Dư nợ đầu kỳ" : "Số dư đầu kỳ";
      item.textContent = `${account.name} · ${label}: ${amount} ${account.currency}`;
      list.append(item);
    }
  };

  request.onerror = () => {
    status.textContent = "Không đọc được danh sách tài khoản.";
  };
}

async function start() {
  const db = await openDatabase();
  dateInput.value = today();
  showAccounts(db);
  saveButton.disabled = false;

  form.onsubmit = (event) => {
    event.preventDefault();
    if (saveButton.disabled) return;

    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const balance = Number(data.get("balance"));

    if (!name || !Number.isSafeInteger(balance)) {
      status.textContent = "Nhập tên tài khoản và số dư nguyên hợp lệ.";
      return;
    }

    const account: Account = {
      id: crypto.randomUUID(),
      name,
      kind: data.get("kind") as Account["kind"],
      currency: data.get("currency") as Account["currency"],
      openingBalanceMinor: balance,
      openingBalanceDate: dateInput.value,
    };

    saveButton.disabled = true;
    const tx = db.transaction("accounts", "readwrite");
    tx.objectStore("accounts").add(account);

    tx.oncomplete = () => {
      form.reset();
      dateInput.value = today();
      saveButton.disabled = false;
      status.textContent = `Đã thêm ${account.name}.`;
      showAccounts(db);
    };

    tx.onabort = () => {
      saveButton.disabled = false;
      status.textContent = "Lưu thất bại. Dữ liệu vừa nhập vẫn còn trong form.";
    };
  };
}

start().catch((error) => {
  status.textContent = `Không mở được database: ${error.message}`;
});