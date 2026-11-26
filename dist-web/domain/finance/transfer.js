export function createTransfer(from, to, amountMinor, date, note) {
    if (from.id === to.id) {
        throw new Error("Tài khoản gửi và nhận phải khác nhau.");
    }
    if (from.currency !== to.currency) {
        throw new Error("Bước này chỉ hỗ trợ chuyển cùng loại tiền.");
    }
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
        throw new Error("Số tiền chuyển phải là số nguyên dương.");
    }
    return {
        id: crypto.randomUUID(),
        fromAccountId: from.id,
        toAccountId: to.id,
        currency: from.currency,
        amountMinor,
        date,
        note,
    };
}
export function transferMovement(transfer, accountId) {
    if (accountId === transfer.fromAccountId)
        return -transfer.amountMinor;
    if (accountId === transfer.toAccountId)
        return transfer.amountMinor;
    return 0;
}
