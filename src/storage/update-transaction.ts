import type { Transaction } from
    "../domain/finance/transaction";

import type { Account } from
    "../domain/finance/account";

import type { TransactionChanges } from
    "../application/commands/finance-mutation";

import {
    createCategoryCatalog,
    assertCategoryReference,
} from "../domain/finance/category-catalog.js";

import {
    isValidTransaction,
} from "../domain/finance/transaction.js";

import {
    isISODate,
} from "../domain/finance/validation.js";

import { DomainError } from
    "../domain/finance/errors.js";

export type {
    TransactionChanges,
} from "../application/commands/finance-mutation";

export function updateTransaction(
    db: IDBDatabase,
    expected: Transaction,
    changes: TransactionChanges,
    maxDate: string
): Promise<void> {

    return new Promise((resolve, reject) => {

        const tx = db.transaction(
            [
                "accounts",
                "transactions",
                "categories",
            ],
            "readwrite"
        );

        const store =
            tx.objectStore("transactions");

        const entryRequest =
            store.get(expected.id);

        const categoryRequest =
            tx.objectStore("categories").getAll();

        const accountRequest =
            tx.objectStore("accounts")
                .get(expected.accountId);

        let failure: unknown;

        tx.oncomplete = () => resolve();

        tx.onabort = () => {

            reject(
                failure ??
                tx.error ??
                new Error(
                    "Không cập nhật được giao dịch."
                )
            );
        };

        accountRequest.onsuccess = () => {

            try {

                const entry:
                    Transaction | undefined =
                    entryRequest.result;

                const account:
                    Account | undefined =
                    accountRequest.result;

                if (!entry) {

                    throw new DomainError(
                        "RECORD_NOT_FOUND"
                    );
                }

                if (!account) {

                    throw new DomainError(
                        "ACCOUNT_NOT_FOUND"
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

                const next: Transaction = {

                    ...entry,

                    kind: changes.kind,

                    amountMinor:
                        changes.amountMinor,

                    date: changes.date,

                    note: changes.note,

                    categoryId:
                        changes.categoryId,
                };

                if (!isValidTransaction(next)) {

                    throw new DomainError(
                        "INVALID_TRANSACTION"
                    );
                }

                if (
                    !isISODate(maxDate) ||

                    next.date <
                    account.openingBalanceDate ||

                    next.date > maxDate
                ) {

                    throw new DomainError(
                        "INVALID_DATE"
                    );
                }

                const catalog =
                    createCategoryCatalog(
                        categoryRequest.result
                    );

                const categoryUnchanged =

                    entry.categoryId ===
                    next.categoryId &&

                    entry.kind === next.kind;

                assertCategoryReference(
                    catalog,
                    next.categoryId,
                    next.kind,
                    categoryUnchanged
                );

                store.put(next);

            } catch (error) {

                failure = error;

                tx.abort();
            }
        };
    });
}