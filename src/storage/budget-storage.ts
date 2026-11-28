import type { Budget } from
    "../domain/finance/budget";

import { isValidBudget } from
    "../domain/finance/budget.js";

import {
    createCategoryCatalog,
    assertCategoryReference,
} from "../domain/finance/category-catalog.js";

import { DomainError } from
    "../domain/finance/errors.js";

function writeBudget(
    db: IDBDatabase,
    id: string,
    expected: Budget | undefined,
    next: Budget | undefined
): Promise<void> {

    return new Promise((resolve, reject) => {

        const tx = db.transaction(
            ["budgets", "categories"],
            "readwrite"
        );

        const store =
            tx.objectStore("budgets");

        const categoryRequest =
            tx.objectStore("categories").getAll();

        const request = store.get(id);

        let failure: unknown;

        tx.oncomplete = () => resolve();

        tx.onabort = () => {
            reject(
                failure ??
                tx.error ??
                new Error("Không lưu được ngân sách.")
            );
        };

        request.onsuccess = () => {

            try {

                const current:
                    Budget | undefined =
                    request.result;

                if (
                    JSON.stringify(current) !==
                    JSON.stringify(expected)
                ) {
                    throw new DomainError(
                        "RECORD_CONFLICT"
                    );
                }

                if (next) {

                    if (
                        !isValidBudget(next) ||
                        next.id !== id
                    ) {
                        throw new DomainError(
                            "INVALID_BUDGET"
                        );
                    }

                    const catalog =
                        createCategoryCatalog(
                            categoryRequest.result
                        );

                    const categoryUnchanged =
                        current !== undefined &&
                        current.categoryId ===
                        next.categoryId;

                    assertCategoryReference(
                        catalog,
                        next.categoryId,
                        "expense",
                        categoryUnchanged
                    );

                    if (current) {
                        store.put(next);
                    } else {
                        store.add(next);
                    }

                } else {

                    store.delete(id);
                }

            } catch (error) {

                failure = error;

                tx.abort();
            }
        };
    });
}

export function saveBudget(
    db: IDBDatabase,
    budget: Budget,
    expected?: Budget
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
    expected: Budget
): Promise<void> {

    return writeBudget(
        db,
        expected.id,
        expected,
        undefined
    );
}