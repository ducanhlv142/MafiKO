import type {
  SupportedCurrencyCode,
} from "./currency";
import { isValidCurrency } from "./currency.js";

import {
  isNonEmptyString,
  isISODate,
  isSafeMinor,
} from "./validation.js";

export type AccountKind =
  typeof accountKinds[number];

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;

  currency: SupportedCurrencyCode;

  openingBalanceMinor: number;
  openingBalanceDate: string;
}

export const accountKinds = [
  "cash",
  "bank",
  "e_wallet",
  "credit_card",
] as const;

export function isValidAccountKind(
  value: unknown
): value is AccountKind {

  return (
    typeof value === "string" &&
    (accountKinds as readonly string[])
      .includes(value)
  );
}

export function isValidAccount(
  value: unknown
): value is Account {

  if (!value || typeof value !== "object") {
    return false;
  }

  const account = value as Account;

  return (
    isNonEmptyString(account.id) &&
    isNonEmptyString(account.name) &&
    isValidAccountKind(account.kind) &&
    isValidCurrency(account.currency) &&
    isSafeMinor(account.openingBalanceMinor) &&
    isISODate(account.openingBalanceDate)
  );
}