import type { Transaction } from
    "../domain/finance/transaction";

import {
    createCategoryCatalog,
    assertCategoryReference,
} from "../domain/finance/category-catalog.js";

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
            [
                "transactions",
                "categories",
            ],
            "readwrite"
        );

        const store =
            tx.objectStore("transactions");

        const request =
            store.get(expected.id);

        const categoryRequest =
            tx.objectStore("categories").getAll();

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

        categoryRequest.onsuccess = () => {

            try {

                const entry:
                    Transaction | undefined =
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

                const catalog =
                    createCategoryCatalog(
                        categoryRequest.result
                    );

                assertCategoryReference(
                    catalog,
                    categoryId,
                    entry.kind
                );

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