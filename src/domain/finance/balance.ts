import {
  sumMinor,
} from "./money.js";

export function calculateBalance(
  openingBalanceMinor: number,
  movements: readonly number[],
): number {

  return sumMinor([
    openingBalanceMinor,
    ...movements,
  ]);
}