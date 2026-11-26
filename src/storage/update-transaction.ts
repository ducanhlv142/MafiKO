import type { Transaction } from "../domain/finance/transaction";
import type { Account } from "../domain/finance/account";

import { categories } from "../domain/finance/category.js";

export type TransactionChanges = Pick<
    Transaction,
    "kind" | "amountMinor" | "date" | "note" | "categoryId"
>;

export function updateTransaction(
    db: IDBDatabase,
    expected: Transaction,
    changes: TransactionChanges,
    maxDate: string,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(
            ["accounts", "transactions"],
            "readwrite"
        );

        const store = tx.objectStore("transactions");

        const entryRequest = store.get(expected.id);

        const accountRequest = tx
            .objectStore("accounts")
            .get(expected.accountId);

        let reason = "Không cập nhật được giao dịch.";

        tx.oncomplete = () => resolve();

        tx.onabort = () => {
            reject(tx.error ?? new Error(reason));
        };

        accountRequest.onsuccess = () => {
            try {
                const entry: Transaction | undefined =
                    entryRequest.result;

                const account: Account | undefined =
                    accountRequest.result;

                if (!entry || !account) {
                    throw new Error(
                        "Giao dịch hoặc tài khoản không còn tồn tại."
                    );
                }

                if (
                    JSON.stringify(entry) !==
                    JSON.stringify(expected)
                ) {
                    throw new Error(
                        "Giao dịch đã thay đổi. Hãy tải lại trang."
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

                if (
                    changes.kind !== "income" &&
                    changes.kind !== "expense"
                ) {
                    throw new Error("Loại giao dịch không hợp lệ.");
                }

                if (
                    changes.categoryId !== undefined &&
                    !Object.hasOwn(
                        categories[changes.kind],
                        changes.categoryId
                    )
                ) {
                    throw new Error("Danh mục không phù hợp.");
                }

                const date = new Date(
                    `${changes.date}T00:00:00Z`
                );

                if (
                    !/^\d{4}-\d{2}-\d{2}$/.test(changes.date) ||
                    !Number.isFinite(date.getTime()) ||
                    date.toISOString().slice(0, 10) !== changes.date ||
                    changes.date < account.openingBalanceDate ||
                    changes.date > maxDate
                ) {
                    throw new Error("Ngày giao dịch không hợp lệ.");
                }

                store.put({
                    ...entry,
                    ...changes,
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