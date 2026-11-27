import type { Account } from
    "../../domain/finance/account";

import type { Transaction } from
    "../../domain/finance/transaction";

import type { Transfer } from
    "../../domain/finance/transfer";

import type { SupportedCurrencyCode } from
    "../../domain/finance/currency";

import type { FinanceRepository } from
    "../ports/finance-repository";

import type { Budget } from
    "../../domain/finance/budget";

import type {
    Loan,
    LoanPayment,
} from "../../domain/finance/debt";

import type {
    TransactionChanges,
    TransferChanges,
    DebtChange,
} from "../commands/finance-mutation";

import type {
    FinanceSnapshot,
    DebtSnapshot,
} from "../queries/finance-snapshot";

export class FinanceService {

    constructor(
        private readonly repository:
            FinanceRepository
    ) { }

    listAccounts(): Promise<Account[]> {

        return this.repository.listAccounts();
    }

    createAccount(
        account: Account,
        maxDate: string
    ): Promise<void> {

        return this.repository.execute({
            type: "account.create",
            account,
            maxDate,
        });
    }

    createTransaction(
        entry: Transaction,
        expectedCurrency: SupportedCurrencyCode,
        maxDate: string
    ): Promise<void> {

        return this.repository.execute({
            type: "transaction.create",
            entry,
            expectedCurrency,
            maxDate,
        });
    }

    createTransfer(
        transfer: Transfer,
        maxDate: string
    ): Promise<void> {

        return this.repository.execute({
            type: "transfer.create",
            transfer,
            maxDate,
        });
    }
    // ========================================
    // TRANSACTION MUTATIONS
    // ========================================

    updateTransaction(
        expected: Transaction,
        changes: TransactionChanges,
        maxDate: string
    ): Promise<void> {

        return this.repository.mutate({
            type: "transaction.update",
            expected,
            changes,
            maxDate,
        });
    }

    deleteTransaction(
        expected: Transaction
    ): Promise<void> {

        return this.repository.mutate({
            type: "transaction.delete",
            expected,
        });
    }

    changeCategory(
        expected: Transaction,
        categoryId: NonNullable<
            Transaction["categoryId"]
        >
    ): Promise<void> {

        return this.repository.mutate({
            type: "transaction.changeCategory",
            expected,
            categoryId,
        });
    }

    // ========================================
    // TRANSFER MUTATIONS
    // ========================================

    updateTransfer(
        expected: Transfer,
        changes: TransferChanges,
        maxDate: string
    ): Promise<void> {

        return this.repository.mutate({
            type: "transfer.update",
            expected,
            changes,
            maxDate,
        });
    }

    deleteTransfer(
        expected: Transfer
    ): Promise<void> {

        return this.repository.mutate({
            type: "transfer.delete",
            expected,
        });
    }

    // ========================================
    // BUDGET MUTATIONS
    // ========================================

    saveBudget(
        budget: Budget,
        expected?: Budget
    ): Promise<void> {

        return this.repository.mutate({
            type: "budget.save",
            budget,
            expected,
        });
    }

    deleteBudget(
        expected: Budget
    ): Promise<void> {

        return this.repository.mutate({
            type: "budget.delete",
            expected,
        });
    }

    // ========================================
    // DEBT & LOAN MUTATIONS
    // ========================================

    saveLoan(
        loan: Loan,
        maxDate: string
    ): Promise<void> {

        return this.repository.mutate({
            type: "loan.create",
            loan,
            maxDate,
        });
    }

    saveLoanPayment(
        payment: LoanPayment,
        expectedLoan: Loan,
        maxDate: string
    ): Promise<void> {

        return this.repository.mutate({
            type: "loan.payment.create",
            payment,
            expectedLoan,
            maxDate,
        });
    }

    mutateDebt(
        expectedLoan: Loan,
        change: DebtChange,
        maxDate: string
    ): Promise<void> {

        return this.repository.mutate({
            type: "loan.mutate",
            expectedLoan,
            change,
            maxDate,
        });
    }

    getFinanceSnapshot(): Promise<FinanceSnapshot> {

        return this.repository.getFinanceSnapshot();
    }

    getDebtSnapshot(): Promise<DebtSnapshot> {

        return this.repository.getDebtSnapshot();
    }
}