export function toMovement(transaction) {
    if (!Number.isSafeInteger(transaction.amountMinor) || transaction.amountMinor <= 0) {
        throw new Error("Số tiền giao dịch phải là số nguyên dương.");
    }
    return transaction.kind === "expense"
        ? -transaction.amountMinor
        : transaction.amountMinor;
}
