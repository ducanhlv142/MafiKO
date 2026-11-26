import type { Account } from "./account";
import type { ExpenseCategoryId, IncomeCategoryId } from "./category";

export interface Transaction {
  id: string;
  accountId: Account["id"];
  kind: "income" | "expense";
  amountMinor: number;
  date: string;
  note: string;
  categoryId?: ExpenseCategoryId | IncomeCategoryId;
}

export function toMovement(transaction: Transaction): number {
  if (!Number.isSafeInteger(transaction.amountMinor) || transaction.amountMinor <= 0) {
    throw new Error("Số tiền giao dịch phải là số nguyên dương.");
  }

  return transaction.kind === "expense"
    ? -transaction.amountMinor
    : transaction.amountMinor;
}