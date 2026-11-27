import type { Account } from
    "../../domain/finance/account";

import type { FinanceRepository } from
    "../../application/ports/finance-repository";

import type { FinanceCommand } from
    "../../application/commands/finance-command";

import {
    validateFinanceCommand,
} from "../../application/commands/finance-command.js";

import { DomainError } from
    "../../domain/finance/errors.js";

import type {
    FinanceMutationCommand,
} from "../../application/commands/finance-mutation";

import { updateTransaction } from
    "../../storage/update-transaction.js";

import { deleteTransaction } from
    "../../storage/delete-transaction.js";

import { changeCategory } from
    "../../storage/change-category.js";

import { updateTransfer } from
    "../../storage/update-transfer.js";

import { deleteTransfer } from
    "../../storage/delete-transfer.js";

import {
    saveBudget,
    deleteBudget,
} from "../../storage/budget-storage.js";

import { saveLoan } from
    "../../storage/loan-storage.js";

import { saveLoanPayment } from
    "../../storage/loan-payment-storage.js";

import { mutateDebt } from
    "../../storage/debt-mutation.js";

export class IndexedDbFinanceRepository
    implements FinanceRepository {

    constructor(
        private readonly db: IDBDatabase
    ) { }

    listAccounts(): Promise<Account[]> {

        return new Promise((resolve, reject) => {

            const tx = this.db.transaction(
                ["accounts"],
                "readonly"
            );

            const request = tx
                .objectStore("accounts")
                .getAll();

            tx.oncomplete = () => {
                resolve(request.result as Account[]);
            };

            tx.onabort = () => {
                reject(
                    tx.error ??
                    new Error(
                        "Không đọc được tài khoản."
                    )
                );
            };
        });
    }

    execute(
        command: FinanceCommand
    ): Promise<void> {

        return new Promise((resolve, reject) => {

            const stores = ["accounts"];

            switch (command.type) {

                case "transaction.create":
                    stores.push("transactions");
                    break;

                case "transfer.create":
                    stores.push("transfers");
                    break;
            }

            const tx = this.db.transaction(
                stores,
                "readwrite"
            );

            let failure: unknown;

            tx.oncomplete = () => resolve();

            tx.onabort = () => {

                if (
                    tx.error?.name ===
                    "ConstraintError"
                ) {
                    reject(
                        new DomainError(
                            "RECORD_CONFLICT"
                        )
                    );

                    return;
                }

                reject(
                    failure ??
                    tx.error ??
                    new Error(
                        "Ghi dữ liệu thất bại."
                    )
                );
            };

            const accountStore =
                tx.objectStore("accounts");

            const accountRequest =
                accountStore.getAll();

            accountRequest.onsuccess = () => {

                try {

                    const accounts: Account[] = accountRequest.result;

                    validateFinanceCommand(
                        command,
                        accounts
                    );

                    switch (command.type) {

                        case "account.create":

                            accountStore.add(
                                command.account
                            );

                            break;

                        case "transaction.create":

                            tx.objectStore(
                                "transactions"
                            ).add(command.entry);

                            break;

                        case "transfer.create":

                            tx.objectStore(
                                "transfers"
                            ).add(command.transfer);

                            break;
                    }

                } catch (error) {

                    failure = error;

                    tx.abort();
                }
            };
        });
    }
    mutate(
        command: FinanceMutationCommand
    ): Promise<void> {

        switch (command.type) {

            case "transaction.update":
                return updateTransaction(
                    this.db,
                    command.expected,
                    command.changes,
                    command.maxDate
                );

            case "transaction.delete":
                return deleteTransaction(
                    this.db,
                    command.expected
                );

            case "transaction.changeCategory":
                return changeCategory(
                    this.db,
                    command.expected,
                    command.categoryId
                );

            case "transfer.update":
                return updateTransfer(
                    this.db,
                    command.expected,
                    command.changes,
                    command.maxDate
                );

            case "transfer.delete":
                return deleteTransfer(
                    this.db,
                    command.expected
                );

            case "budget.save":
                return saveBudget(
                    this.db,
                    command.budget,
                    command.expected
                );

            case "budget.delete":
                return deleteBudget(
                    this.db,
                    command.expected
                );

            case "loan.create":
                return saveLoan(
                    this.db,
                    command.loan,
                    command.maxDate
                );

            case "loan.payment.create":
                return saveLoanPayment(
                    this.db,
                    command.payment,
                    command.expectedLoan,
                    command.maxDate
                );

            case "loan.mutate":
                return mutateDebt(
                    this.db,
                    command.expectedLoan,
                    command.change,
                    command.maxDate
                );

            default:
                return Promise.reject(
                    new Error(
                        "Unsupported mutation command."
                    )
                );
        }
    }
}