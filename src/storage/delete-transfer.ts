import type { Transfer } from "../domain/finance/transfer";

export function deleteTransfer(
    db: IDBDatabase,
    expected: Transfer,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction("transfers", "readwrite");

        const store = tx.objectStore("transfers");
        const request = store.get(expected.id);

        let reason = "Không xóa được khoản chuyển tiền.";

        tx.oncomplete = () => resolve();

        tx.onabort = () => {
            reject(tx.error ?? new Error(reason));
        };

        request.onsuccess = () => {
            const transfer: Transfer | undefined =
                request.result;

            if (!transfer) {
                reason = "Khoản chuyển tiền không còn tồn tại.";
                tx.abort();
                return;
            }

            if (
                JSON.stringify(transfer) !==
                JSON.stringify(expected)
            ) {
                reason =
                    "Khoản chuyển đã thay đổi. Hãy tải lại trang.";

                tx.abort();
                return;
            }

            store.delete(transfer.id);
        };
    });
}