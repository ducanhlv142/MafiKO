export function calculateBalance(openingBalanceMinor, movements) {
    let balance = openingBalanceMinor;
    for (const amount of movements) {
        balance += amount;
    }
    return balance;
}
