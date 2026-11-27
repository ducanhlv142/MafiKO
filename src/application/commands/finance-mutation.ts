import type { Transaction } from
    "../../domain/finance/transaction";

import type { Transfer } from
    "../../domain/finance/transfer";

import type { Budget } from
    "../../domain/finance/budget";

import type {
    Loan,
    LoanPayment,
} from "../../domain/finance/debt";

export type TransactionChanges = Pick<
    Transaction,
    "kind" |
    "amountMinor" |
    "date" |
    "note" |
    "categoryId"
>;

export type TransferChanges = Pick<
    Transfer,
    "amountMinor" |
    "date" |
    "note"
>;

export type DebtChange =
    | {
        kind: "updateLoan";
        next: Loan;
    }
    | {
        kind: "deleteLoan";
    }
    | {
        kind: "updatePayment";
        expected: LoanPayment;
        next: LoanPayment;
    }
    | {
        kind: "deletePayment";
        expected: LoanPayment;
    };

export type FinanceMutationCommand =
    | {
        type: "transaction.update";
        expected: Transaction;
        changes: TransactionChanges;
        maxDate: string;
    }
    | {
        type: "transaction.delete";
        expected: Transaction;
    }
    | {
        type: "transaction.changeCategory";
        expected: Transaction;
        categoryId: NonNullable<
            Transaction["categoryId"]
        >;
    }
    | {
        type: "transfer.update";
        expected: Transfer;
        changes: TransferChanges;
        maxDate: string;
    }
    | {
        type: "transfer.delete";
        expected: Transfer;
    }
    | {
        type: "budget.save";
        budget: Budget;
        expected?: Budget;
    }
    | {
        type: "budget.delete";
        expected: Budget;
    }
    | {
        type: "loan.create";
        loan: Loan;
        maxDate: string;
    }
    | {
        type: "loan.payment.create";
        payment: LoanPayment;
        expectedLoan: Loan;
        maxDate: string;
    }
    | {
        type: "loan.mutate";
        expectedLoan: Loan;
        change: DebtChange;
        maxDate: string;
    };