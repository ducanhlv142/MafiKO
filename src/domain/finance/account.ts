import type {
  SupportedCurrencyCode,
} from "./currency";

export type AccountKind =
  | "cash"
  | "bank"
  | "e_wallet"
  | "credit_card";

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;

  currency: SupportedCurrencyCode;

  openingBalanceMinor: number;
  openingBalanceDate: string;
}