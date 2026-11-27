import type { Account } from "./account";
import { isValidCurrency } from "./currency.js";
import { isValidAccount } from "./account.js";
import { DomainError } from "./errors.js";

import {
  isNonEmptyString,
  isPositiveMinor,
  isISODate,
} from "./validation.js";

export interface Transfer {
  id: string;
  fromAccountId: Account["id"];
  toAccountId: Account["id"];
  currency: Account["currency"];
  amountMinor: number;
  date: string;
  note: string;
}

export function createTransfer(
  from: Account,
  to: Account,
  amountMinor: number,
  date: string,
  note: string,
): Transfer {

  if (
    !isValidAccount(from) ||
    !isValidAccount(to)
  ) {
    throw new DomainError("INVALID_ACCOUNT");
  }

  if (from.id === to.id) {
    throw new DomainError("SAME_ACCOUNT");
  }

  if (from.currency !== to.currency) {
    throw new DomainError("CURRENCY_MISMATCH");
  }

  if (!isPositiveMinor(amountMinor)) {
    throw new DomainError("INVALID_AMOUNT");
  }

  if (
    !isISODate(date) ||
    date < from.openingBalanceDate ||
    date < to.openingBalanceDate
  ) {
    throw new DomainError("INVALID_DATE");
  }

  const transfer: Transfer = {
    id: crypto.randomUUID(),
    fromAccountId: from.id,
    toAccountId: to.id,
    currency: from.currency,
    amountMinor,
    date,
    note,
  };

  if (!isValidTransfer(transfer)) {
    throw new DomainError("INVALID_TRANSFER");
  }

  return transfer;
}

export function transferMovement(transfer: Transfer, accountId: string): number {
  if (accountId === transfer.fromAccountId) return -transfer.amountMinor;
  if (accountId === transfer.toAccountId) return transfer.amountMinor;
  return 0;
}

export function isValidTransfer(
  value: unknown
): value is Transfer {

  if (!value || typeof value !== "object") {
    return false;
  }

  const transfer = value as Transfer;

  return (
    isNonEmptyString(transfer.id) &&
    isNonEmptyString(transfer.fromAccountId) &&
    isNonEmptyString(transfer.toAccountId) &&
    transfer.fromAccountId !== transfer.toAccountId &&
    isValidCurrency(transfer.currency) &&
    isPositiveMinor(transfer.amountMinor) &&
    isISODate(transfer.date) &&
    typeof transfer.note === "string"
  );
}