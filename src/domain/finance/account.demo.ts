import type { Account } from "./account";
import { calculateBalance } from "./balance";

const wallet: Account = {
  id: "wallet-jpy",
  name: "Ví tiền mặt",
  kind: "cash",
  currency: "JPY",
  openingBalanceMinor: 5000,
  openingBalanceDate: "2026-11-26",
};

const movements = [-650, 2000];
const balance = calculateBalance(wallet.openingBalanceMinor, movements);

console.log(`${wallet.name}: ${balance} ${wallet.currency}`);