import type { Account } from
    "../../domain/finance/account";

import type { FinanceCommand } from
    "../commands/finance-command";
import type {
    FinanceMutationCommand,
} from "../commands/finance-mutation";

export interface FinanceRepository {

    listAccounts(): Promise<Account[]>;

    execute(
        command: FinanceCommand
    ): Promise<void>;

    mutate(
        command: FinanceMutationCommand
    ): Promise<void>;
}