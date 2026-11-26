import { categories } from "../domain/finance/category.js";
export function changeCategory(db, transactionId, categoryId) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction("transactions", "readwrite");
        const store = tx.objectStore("transactions");
        const request = store.get(transactionId);
        let reason = "Không lưu được danh mục.";
        request.onsuccess = () => {
            const entry = request.result;
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
