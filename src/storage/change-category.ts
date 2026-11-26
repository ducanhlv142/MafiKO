import { categories } from "../domain/finance/category.js";
import type { Transaction } from "../domain/finance/transaction";

export function changeCategory(
    db: IDBDatabase,
    transactionId: string,
    categoryId: NonNullable<Transaction["categoryId"]>,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction("transactions", "readwrite");
        const store = tx.objectStore("transactions");
        const request = store.get(transactionId);
        let reason = "Không lưu được danh mục.";

        request.onsuccess = () => {
            const entry: Transaction | undefined = request.result;

            if (!entry) {
                reason = "Giao dịch này không còn trong sổ.";
                tx.abort();
                return;
            }

            if (!Object.hasOwn(categories[entry.kind], categoryId)) {
                reason = "Danh mục không phù hợp với loại thu/chi.";
                tx.abort();
                return;
            }

            store.put({ ...entry, categoryId });
        };

        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error ?? new Error(reason));
    });
}