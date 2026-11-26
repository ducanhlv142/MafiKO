import type { Budget } from "../domain/finance/budget";

import { isValidBudget } from "../domain/finance/budget.js";

function writeBudget(
    db: IDBDatabase,
    id: string,
    expected: Budget | undefined,
    next: Budget | undefined,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction("budgets", "readwrite");

        const store = tx.objectStore("budgets");
        const request = store.get(id);

        let reason = "Không lưu được ngân sách.";

        tx.oncomplete = () => resolve();

        tx.onabort = () => {
            reject(tx.error ?? new Error(reason));
        };

        request.onsuccess = () => {
            try {
                const current: Budget | undefined =
                    request.result;

                if (
                    JSON.stringify(current) !==
                    JSON.stringify(expected)
                ) {
                    throw new Error(
                        "Ngân sách đã thay đổi. Hãy tải lại dữ liệu."
                    );
                }

                if (next) {
                    if (!isValidBudget(next) || next.id !== id) {
                        throw new Error(
                            "Ngân sách không hợp lệ."
                        );
                    }

                    if (current) {
                        store.put(next);
                    } else {
                        store.add(next);
                    }
                } else {
                    store.delete(id);
                }

            } catch (error) {
                reason = error instanceof Error
                    ? error.message
                    : "Thao tác thất bại.";

                tx.abort();
            }
        };
    });
}

export function saveBudget(
    db: IDBDatabase,
    budget: Budget,
    expected?: Budget,
): Promise<void> {
    return writeBudget(
        db,
        budget.id,
        expected,
        budget
    );
}

export function deleteBudget(
    db: IDBDatabase,
    expected: Budget,
): Promise<void> {
    return writeBudget(
        db,
        expected.id,
        expected,
        undefined
    );
}