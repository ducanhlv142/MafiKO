import type { Account } from "../domain/finance/account";
import { openDatabase } from "./database.js";

const output = document.querySelector<HTMLPreElement>("#output")!;
const saveButton = document.querySelector<HTMLButtonElement>("#save-wallet")!;

async function start() {
  const db = await openDatabase();

  function showWallet() {
    const store = db.transaction("accounts", "readonly").objectStore("accounts");
    const request = store.get("wallet-jpy");

    request.onsuccess = () => {
      const wallet: Account | undefined = request.result;
      output.textContent = wallet
        ? JSON.stringify(wallet, null, 2)
        : "Chưa có ví trong database.";
    };

    request.onerror = () => {
      output.textContent = "Không đọc được ví.";
    };
  }

  saveButton.onclick = () => {
    const wallet: Account = {
      id: "wallet-jpy",
      name: "Ví tiền mặt",
      kind: "cash",
      currency: "JPY",
      openingBalanceMinor: 5000,
      openingBalanceDate: "2026-11-26",
    };

    const tx = db.transaction("accounts", "readwrite");
    tx.objectStore("accounts").put(wallet);
    tx.oncomplete = showWallet;
    tx.onabort = () => {
      output.textContent = "Lưu ví thất bại.";
    };
  };

  saveButton.disabled = false;
  showWallet();
}

start().catch((error) => {
  output.textContent = `Không mở được database: ${error.message}`;
});
