import type { Account } from "../domain/finance/account";
import { openDatabase } from "./database.js";
import { createBackup } from "./backup.js";
import type { FinanceBackup } from "./backup";
import { parseBackup, restoreBackup } from "./restore.js";

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
  const exportButton = document.querySelector<HTMLButtonElement>("#export-backup")!;
  const backupStatus = document.querySelector<HTMLElement>("#backup-status")!;

  exportButton.disabled = false;

  exportButton.onclick = async () => {
    exportButton.disabled = true;

    try {
      const backup = await createBackup(db);
      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = `mafiko-${backup.exportedAt.replace(/[:.]/g, "-")}.json`;
      link.click();

      window.setTimeout(() => URL.revokeObjectURL(url), 1000);

      backupStatus.textContent =
        `Đã tạo bản sao gồm ${backup.accounts.length} tài khoản, ` +
        `${backup.transactions.length} giao dịch thu/chi và ` +
        `${backup.transfers.length} lần chuyển tiền.`;
    } catch (error) {
      backupStatus.textContent =
        error instanceof Error ? error.message : "Tạo bản sao lưu thất bại.";
    } finally {
      exportButton.disabled = false;
    }
  };

  const backupFile = document.querySelector<HTMLInputElement>("#backup-file")!;
  const preview = document.querySelector<HTMLElement>("#restore-preview")!;

  const restoreButton = document.querySelector<HTMLButtonElement>("#restore-backup")!;
  let pending: FinanceBackup | null = null;

  backupFile.onchange = async () => {
    const file = backupFile.files?.[0];
    pending = null;
    restoreButton.disabled = true;
    preview.textContent = "";
    if (!file) return;

    try {
      const backup = parseBackup(await file.text());
      if (backupFile.files?.[0] !== file) return;

      pending = backup;
      preview.textContent =
        `${file.name} · ${backup.accounts.length} tài khoản · ` +
        `${backup.transactions.length} giao dịch · ${backup.transfers.length} lần chuyển.`;
      restoreButton.disabled = false;
    } catch (error) {
      if (backupFile.files?.[0] !== file) return;
      preview.textContent = error instanceof Error ? error.message : "File không hợp lệ.";
    }
  };

  restoreButton.onclick = async () => {
    const backup = pending;
    if (!backup) return;

    const confirmed = window.confirm(
      `Thay thế toàn bộ sổ trên thiết bị này bằng ${backupFile.files?.[0]?.name}?\n` +
      `Sổ sau khôi phục sẽ có ${backup.accounts.length} tài khoản, ` +
      `${backup.transactions.length} giao dịch và ${backup.transfers.length} lần chuyển.`,
    );
    if (!confirmed) return;

    restoreButton.disabled = true;
    backupFile.disabled = true;

    try {
      await restoreBackup(db, backup);
      pending = null;
      backupFile.value = "";
      showAccounts(db);
      preview.textContent = "Đã khôi phục sổ.";
    } catch (error) {
      preview.textContent = error instanceof Error ? error.message : "Khôi phục thất bại.";
      restoreButton.disabled = false;
    } finally {
      backupFile.disabled = false;
    }
  };

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