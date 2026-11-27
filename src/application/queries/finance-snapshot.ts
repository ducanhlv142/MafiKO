import type { Account } from
    "../../domain/finance/account";

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

import type {
    SavingsPlan,
    SavingsMovement,
} from "../../domain/finance/savings";

export interface DebtSnapshot {
    accounts: Account[];
    loans: Loan[];
    loanPayments: LoanPayment[];
}

export interface FinanceSnapshot
    extends DebtSnapshot {

    transactions: Transaction[];
    transfers: Transfer[];
    budgets: Budget[];

    savingsPlans: SavingsPlan[];
    savingsMovements: SavingsMovement[];
}