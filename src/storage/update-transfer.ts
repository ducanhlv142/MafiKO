import type { Transfer } from "../domain/finance/transfer";
import type { Account } from "../domain/finance/account";

export type TransferChanges = Pick<
    Transfer,
    "amountMinor" | "date" | "note"
>;

export function updateTransfer(
    db: IDBDatabase,
    expected: Transfer,
    changes: TransferChanges,
    maxDate: string,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(
            ["accounts", "transfers"],
            "readwrite"
        );

        const store = tx.objectStore("transfers");
        const accounts = tx.objectStore("accounts");

        const transferRequest = store.get(expected.id);

        const fromRequest = accounts.get(
            expected.fromAccountId
        );

        const toRequest = accounts.get(
            expected.toAccountId
        );

        let reason = "Không cập nhật được khoản chuyển tiền.";

        tx.oncomplete = () => resolve();

        tx.onabort = () => {
            reject(tx.error ?? new Error(reason));
        };

        toRequest.onsuccess = () => {
            try {
                const transfer: Transfer | undefined =
                    transferRequest.result;

                const from: Account | undefined =
                    fromRequest.result;

                const to: Account | undefined =
                    toRequest.result;

                if (!transfer || !from || !to) {
                    throw new Error(
                        "Khoản chuyển hoặc tài khoản không tồn tại."
                    );
                }

                if (
                    JSON.stringify(transfer) !==
                    JSON.stringify(expected)
                ) {
                    throw new Error(
                        "Khoản chuyển đã thay đổi. Hãy tải lại trang."
                    );
                }

                if (
                    from.id === to.id ||
                    from.currency !== transfer.currency ||
                    to.currency !== transfer.currency
                ) {
                    throw new Error(
                        "Tài khoản chuyển tiền không hợp lệ."
                    );
                }

                if (
                    !Number.isSafeInteger(changes.amountMinor) ||
                    changes.amountMinor <= 0
                ) {
                    throw new Error(
                        "Số tiền phải là số nguyên dương."
                    );
                }

                const date = new Date(
                    `${changes.date}T00:00:00Z`
                );

                if (
                    !/^\d{4}-\d{2}-\d{2}$/.test(changes.date) ||
                    !Number.isFinite(date.getTime()) ||
                    date.toISOString().slice(0, 10) !== changes.date ||
                    changes.date < from.openingBalanceDate ||
                    changes.date < to.openingBalanceDate ||
                    changes.date > maxDate
                ) {
                    throw new Error(
                        "Ngày chuyển tiền không hợp lệ."
                    );
                }

                store.put({
                    ...transfer,
                    amountMinor: changes.amountMinor,
                    date: changes.date,
                    note: changes.note,
                });

            } catch (error) {
                reason = error instanceof Error
                    ? error.message
                    : "Cập nhật thất bại.";

                tx.abort();
            }
        };
    });
}