export function calculateBalance(
  openingBalanceMinor: number,
  movements: readonly number[],
): number {
  let balance = openingBalanceMinor;

  for (const amount of movements) {
    balance += amount;
  }

  return balance;
}