import { categories } from
    "../domain/finance/category.js";

import type { Transaction } from
    "../domain/finance/transaction";

import { DomainError } from
    "../domain/finance/errors.js";

export function changeCategory(
    db: IDBDatabase,
    expected: Transaction,
    categoryId: NonNullable<
        Transaction["categoryId"]
    >
): Promise<void> {

    return new Promise((resolve, reject) => {

        const tx = db.transaction(
            "transactions",
            "readwrite"
        );

        const store =
            tx.objectStore("transactions");

        const request =
            store.get(expected.id);

        let failure: unknown;

        tx.oncomplete = () => resolve();

        tx.onabort = () => {

            reject(
                failure ??
                tx.error ??
                new Error(
                    "Không lưu được danh mục."
                )
            );
        };

        request.onsuccess = () => {

            try {

                const entry: Transaction | undefined =
                    request.result;

                if (!entry) {
                    throw new DomainError(
                        "RECORD_NOT_FOUND"
                    );
                }

                if (
                    JSON.stringify(entry) !==
                    JSON.stringify(expected)
                ) {
                    throw new DomainError(
                        "RECORD_CONFLICT"
                    );
                }

                if (
                    !Object.hasOwn(
                        categories[entry.kind],
                        categoryId
                    )
                ) {
                    throw new DomainError(
                        "INVALID_TRANSACTION"
                    );
                }

                store.put({
                    ...entry,
                    categoryId,
                });

            } catch (error) {

                failure = error;

                tx.abort();
            }
        };
    });
}