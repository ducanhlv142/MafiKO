import type { Account } from
    "../../domain/finance/account";

import type { Transaction } from
    "../../domain/finance/transaction";

import type { Transfer } from
    "../../domain/finance/transfer";

import type { SupportedCurrencyCode } from
    "../../domain/finance/currency";

import { isValidAccount } from
    "../../domain/finance/account.js";

import { isValidTransaction } from
    "../../domain/finance/transaction.js";

import { isValidTransfer } from
    "../../domain/finance/transfer.js";

import { isISODate } from
    "../../domain/finance/validation.js";

import { DomainError } from
    "../../domain/finance/errors.js";

export type FinanceCommand =
    | {
        type: "account.create";
        account: Account;
        maxDate: string;
    }
    | {
        type: "transaction.create";
        entry: Transaction;
        expectedCurrency: SupportedCurrencyCode;
        maxDate: string;
    }
    | {
        type: "transfer.create";
        transfer: Transfer;
        maxDate: string;
    };

function requireAccount(
    accounts: readonly Account[],
    id: string
): Account {

    const account = accounts.find(
        item => item.id === id
    );

    if (!account) {
        throw new DomainError("ACCOUNT_NOT_FOUND");
    }

    if (!isValidAccount(account)) {
        throw new DomainError("INVALID_ACCOUNT");
    }

    return account;
}

export function validateFinanceCommand(
    command: FinanceCommand,
    accounts: readonly Account[]
): void {

    if (!isISODate(command.maxDate)) {
        throw new DomainError("INVALID_DATE");
    }

    switch (command.type) {

        case "account.create": {

            const account = command.account;

            if (!isValidAccount(account)) {
                throw new DomainError(
                    "INVALID_ACCOUNT"
                );
            }

            if (
                account.openingBalanceDate >
                command.maxDate
            ) {
                throw new DomainError(
                    "INVALID_DATE"
                );
            }

            if (
                accounts.some(
                    item => item.id === account.id
                )
            ) {
                throw new DomainError(
                    "RECORD_CONFLICT"
                );
            }

            return;
        }

        case "transaction.create": {

            const entry = command.entry;

            if (!isValidTransaction(entry)) {
                throw new DomainError(
                    "INVALID_TRANSACTION"
                );
            }

            const account = requireAccount(
                accounts,
                entry.accountId
            );

            if (
                account.currency !==
                command.expectedCurrency
            ) {
                throw new DomainError(
                    "CURRENCY_MISMATCH"
                );
            }

            if (
                entry.date <
                account.openingBalanceDate ||
                entry.date > command.maxDate
            ) {
                throw new DomainError(
                    "INVALID_DATE"
                );
            }

            return;
        }

        case "transfer.create": {

            const transfer = command.transfer;

            if (!isValidTransfer(transfer)) {
                throw new DomainError(
                    "INVALID_TRANSFER"
                );
            }

            const from = requireAccount(
                accounts,
                transfer.fromAccountId
            );

            const to = requireAccount(
                accounts,
                transfer.toAccountId
            );

            if (
                from.currency !== transfer.currency ||
                to.currency !== transfer.currency
            ) {
                throw new DomainError(
                    "CURRENCY_MISMATCH"
                );
            }

            if (
                transfer.date <
                from.openingBalanceDate ||
                transfer.date <
                to.openingBalanceDate ||
                transfer.date > command.maxDate
            ) {
                throw new DomainError(
                    "INVALID_DATE"
                );
            }

            return;
        }

        default:
            throw new Error(
                "Unsupported finance command."
            );
    }
}