import type { Account } from "./account";

import {
  isCategoryIdForKind,
} from "./category-catalog.js";

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

  categoryId?: string;
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

      isCategoryIdForKind(
        entry.categoryId,
        entry.kind
      )
    )
  );
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