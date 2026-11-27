import type { Account } from "./account";
import type { Transaction } from "./transaction";

export type LedgerPositionKind =
    | "account"
    | "loan"
    | "savings"
    | "income"
    | "expense";

export type LedgerEventSource =
    | "transaction"
    | "transfer"
    | "loan"
    | "loanPayment"
    | "savingsPlan"
    | "savingsMovement";

export type LedgerCurrency =
    | {
        kind: "account";
        accountId: string;
    }
    | {
        kind: "explicit";
        code: Account["currency"];
    };

export interface LedgerPosting {

    positionKind: LedgerPositionKind;

    positionId: string;

    amountMinor: number;
}

export interface LedgerReportMetadata {

    id: string;

    accountId: string;

    categoryId?: Transaction["categoryId"];
}

export interface LedgerEvent {

    id: string;

    source: LedgerEventSource;
    sourceId: string;

    currency: LedgerCurrency;

    date: string;
    note: string;

    postings: readonly LedgerPosting[];

    report?: LedgerReportMetadata;
}