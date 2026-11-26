import type { Account } from "./account";
import { calculateBalance } from "./balance";
import type { Transaction } from "./transaction";
import { toMovement } from "./transaction";
import { createTransfer, transferMovement } from "./transfer";

const wallet: Account = {
  id: "wallet-jpy",
  name: "Ví tiền mặt",
  kind: "cash",
  currency: "JPY",
  openingBalanceMinor: 5000,
  openingBalanceDate: "2026-11-26",
};

const transactions: Transaction[] = [
  {
    id: "tx-001",
    accountId: wallet.id,
    kind: "expense",
    amountMinor: 650,
    date: "2026-11-26",
    note: "Mua cơm trưa",
  },
  {
    id: "tx-002",
    accountId: wallet.id,
    kind: "income",
    amountMinor: 2000,
    date: "2026-11-26",
    note: "Nhận tiền công",
  },
];

const walletTransactions = transactions.filter(
  (transaction) => transaction.accountId === wallet.id,
);

for (const transaction of walletTransactions) {
  console.log(`${transaction.date} | ${transaction.note} | ${toMovement(transaction)} ${wallet.currency}`);
}

const balance = calculateBalance(
  wallet.openingBalanceMinor,
  walletTransactions.map(toMovement),
);

console.log(`${wallet.name}: ${balance} ${wallet.currency}`);

const bank: Account = {
  id: "bank-jpy",
  name: "Ngân hàng",
  kind: "bank",
  currency: "JPY",
  openingBalanceMinor: 10000,
  openingBalanceDate: "2026-11-26",
};

const withdrawal = createTransfer(bank, wallet, 2000, "2026-11-26", "Rút ATM");

const walletAfter = calculateBalance(wallet.openingBalanceMinor, [
  ...walletTransactions.map(toMovement),
  transferMovement(withdrawal, wallet.id),
]);

const bankAfter = calculateBalance(bank.openingBalanceMinor, [
  transferMovement(withdrawal, bank.id),
]);

console.log(`Sau khi ${withdrawal.note}:`);
console.log(`${wallet.name}: ${walletAfter} JPY`);
console.log(`${bank.name}: ${bankAfter} JPY`);
console.log(`Tổng hai tài khoản: ${walletAfter + bankAfter} JPY`);