import type { Account } from
    "../../domain/finance/account";

import type { FinanceCommand } from
    "../commands/finance-command";
import type {
    FinanceMutationCommand,
} from "../commands/finance-mutation";
import type {
    FinanceSnapshot,
    DebtSnapshot,
} from "../queries/finance-snapshot";

export interface FinanceRepository {

    listAccounts(): Promise<Account[]>;

    getFinanceSnapshot(): Promise<FinanceSnapshot>;

    getDebtSnapshot(): Promise<DebtSnapshot>;

    execute(
        command: FinanceCommand
    ): Promise<void>;

    mutate(
        command: FinanceMutationCommand
    ): Promise<void>;
}