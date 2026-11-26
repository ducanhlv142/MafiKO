import type { Transaction } from "../domain/finance/transaction";

export function deleteTransaction(
    db: IDBDatabase,
    expected: Transaction,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(
            "transactions",
            "readwrite"
        );

        const store = tx.objectStore("transactions");
        const request = store.get(expected.id);

        let reason = "Không xóa được giao dịch.";

        tx.oncomplete = () => resolve();

        tx.onabort = () => {
            reject(tx.error ?? new Error(reason));
        };

        request.onsuccess = () => {
            const entry: Transaction | undefined =
                request.result;

            if (!entry) {
                reason = "Giao dịch không còn tồn tại.";
                tx.abort();
                return;
            }

            if (
                JSON.stringify(entry) !==
                JSON.stringify(expected)
            ) {
                reason =
                    "Giao dịch đã thay đổi. Hãy tải lại trang.";

                tx.abort();
                return;
            }

            store.delete(entry.id);
        };
    });
}