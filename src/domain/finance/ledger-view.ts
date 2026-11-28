import type { Account } from "./account";

import type {
    FinancialLedger,
} from "./ledger-projection";

import type {
    LedgerPositionKind,
} from "./ledger-posting";

import { isValidAccount } from "./account.js";

import { projectLedger } from "./ledger-projection.js";

import {
    getReportTransactionsFromEvents,
} from "./ledger.js";

import { sumMinor } from "./money.js";

import { DomainError } from "./errors.js";

import type { CategoryRecord } from
    "./category-catalog";

import {
    createDefaultCategories,
    createCategoryCatalog,
    assertCategoryReference,
} from "./category-catalog.js";

export interface LedgerSnapshot
    extends FinancialLedger {

    accounts: readonly Account[];

    categories?: readonly CategoryRecord[];
}

export function createLedgerView(
    snapshot: LedgerSnapshot
) {

    const accounts = new Map<string, Account>();

    for (const account of snapshot.accounts) {

        if (!isValidAccount(account)) {
            throw new DomainError("INVALID_ACCOUNT");
        }

        if (accounts.has(account.id)) {
            throw new DomainError("RECORD_CONFLICT");
        }

        accounts.set(account.id, { ...account });
    }

    function requireAccount(id: string): Account {

        const account = accounts.get(id);

        if (!account) {
            throw new DomainError("ACCOUNT_NOT_FOUND");
        }

        return account;
    }

    const catalog = createCategoryCatalog(
        snapshot.categories ??
        createDefaultCategories()
    );

    for (const entry of snapshot.transactions) {

        assertCategoryReference(
            catalog,
            entry.categoryId,
            entry.kind,
            true
        );
    }

    const events = projectLedger(snapshot);

    const index = new Map<
        LedgerPositionKind,
        Map<string, number[]>
    >();

    for (const event of events) {

        const currency =
            event.currency.kind === "explicit"
                ? event.currency.code
                : requireAccount(
                    event.currency.accountId
                ).currency;

        function checkAccount(id: string): void {

            const account = requireAccount(id);

            if (account.currency !== currency) {
                throw new DomainError(
                    "CURRENCY_MISMATCH"
                );
            }

            if (
                event.date <
                account.openingBalanceDate
            ) {
                throw new DomainError("INVALID_DATE");
            }
        }

        if (event.report) {
            checkAccount(event.report.accountId);
        }

        for (const posting of event.postings) {

            if (
                posting.positionKind === "account" ||
                posting.positionKind === "income" ||
                posting.positionKind === "expense"
            ) {
                checkAccount(posting.positionId);
            }

            let positions = index.get(
                posting.positionKind
            );

            if (!positions) {

                positions = new Map<string, number[]>();

                index.set(
                    posting.positionKind,
                    positions
                );
            }

            let amounts = positions.get(
                posting.positionId
            );

            if (!amounts) {

                amounts = [];

                positions.set(
                    posting.positionId,
                    amounts
                );
            }

            amounts.push(posting.amountMinor);
        }
    }

    function movements(
        kind: LedgerPositionKind,
        id: string
    ): readonly number[] {

        return index.get(kind)?.get(id) ?? [];
    }

    return {

        getAccountBalance(id: string): number {

            const account = requireAccount(id);

            const values = movements(
                "account",
                id
            );

            const changes =
                account.kind === "credit_card"
                    ? values.map(value => -value)
                    : values;

            return sumMinor([
                account.openingBalanceMinor,
                ...changes,
            ]);
        },

        getPositionNet(
            kind: "loan" | "savings",
            id: string
        ): number {

            return sumMinor(
                movements(kind, id)
            );
        },

        getReportTransactions() {

            return getReportTransactionsFromEvents(
                events
            );
        },
    };
}