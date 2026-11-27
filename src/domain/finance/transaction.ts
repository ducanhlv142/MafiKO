import type { Account } from "./account";
import type { ExpenseCategoryId, IncomeCategoryId } from "./category";
import { categories } from "./category.js";
import { DomainError } from "./errors.js";

import {
  isNonEmptyString,
  isPositiveMinor,
  isISODate,
} from "./validation.js";

export interface Transaction {
  id: string;
  accountId: Account["id"];
  kind: "income" | "expense";
  amountMinor: number;
  date: string;
  note: string;
  categoryId?: ExpenseCategoryId | IncomeCategoryId;
}

export function toMovement(
  transaction: Transaction
): number {

  if (!isValidTransaction(transaction)) {
    throw new DomainError(
      "INVALID_TRANSACTION"
    );
  }

  return transaction.kind === "expense"
    ? -transaction.amountMinor
    : transaction.amountMinor;
}

export function isValidTransaction(
  value: unknown
): value is Transaction {

  if (!value || typeof value !== "object") {
    return false;
  }

  const entry = value as Transaction;

  if (
    entry.kind !== "income" &&
    entry.kind !== "expense"
  ) {
    return false;
  }

  return (
    isNonEmptyString(entry.id) &&
    isNonEmptyString(entry.accountId) &&
    isPositiveMinor(entry.amountMinor) &&
    isISODate(entry.date) &&
    typeof entry.note === "string" &&
    (
      entry.categoryId === undefined ||
      (
        typeof entry.categoryId === "string" &&
        Object.hasOwn(
          categories[entry.kind],
          entry.categoryId
        )
      )
    )
  );
}