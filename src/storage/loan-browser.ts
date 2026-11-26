import type { Account } from "../domain/finance/account";
import type { LoanDirection } from "../domain/finance/debt";

import {
    createLoan,
    summarizeLoan,
} from "../domain/finance/debt.js";

import { openDatabase } from "./database.js";
import { createBackup } from "./backup.js";
import { saveLoan } from "./loan-storage.js";

const form =
    document.querySelector<HTMLFormElement>("#loan-form")!;

const directionSelect =
    document.querySelector<HTMLSelectElement>("#loan-direction")!;

const counterpartyInput =
    document.querySelector<HTMLInputElement>("#loan-counterparty")!;

const accountSelect =
    document.querySelector<HTMLSelectElement>("#loan-account")!;

const principalInput =
    document.querySelector<HTMLInputElement>("#loan-principal")!;

const rateInput =
    document.querySelector<HTMLInputElement>("#loan-rate")!;

const startInput =
    document.querySelector<HTMLInputElement>("#loan-start")!;

const dueInput =
    document.querySelector<HTMLInputElement>("#loan-due")!;

const noteInput =
    document.querySelector<HTMLInputElement>("#loan-note")!;

const saveButton =
    document.querySelector<HTMLButtonElement>("#loan-save")!;

const currencySelect =
    document.querySelector<HTMLSelectElement>("#loan-currency")!;

const totals =
    document.querySelector<HTMLElement>("#loan-totals")!;

const list =
    document.querySelector<HTMLTableSectionElement>("#loan-list")!;

const status =
    document.querySelector<HTMLElement>("#loan-status")!;

function today(): string {
    const now = new Date();

    const month = String(
        now.getMonth() + 1
    ).padStart(2, "0");

    const day = String(
        now.getDate()
    ).padStart(2, "0");

    return `${now.getFullYear()}-${month}-${day}`;
}

function parseRateBps(value: string): number {
    if (!/^\d+(\.\d{1,2})?$/.test(value)) {
        throw new Error(
            "Lãi suất phải có tối đa hai chữ số thập phân."
        );
    }

    const [whole, fraction = ""] = value.split(".");

    const bps =
        Number(whole) * 100 +
        Number(fraction.padEnd(2, "0"));

    if (!Number.isSafeInteger(bps) || bps < 0) {
        throw new Error("Lãi suất không hợp lệ.");
    }

    return bps;
}

async function start() {
    const db = await openDatabase();

    let accounts: Account[] = [];
    let writing = false;
    let ready = false;
    let refreshVersion = 0;

    startInput.value = today();
    startInput.max = today();

    function updateDateLimits() {
        const account = accounts.find(
            a => a.id === accountSelect.value
        );

        startInput.min =
            account?.openingBalanceDate ?? "";

        dueInput.min = startInput.value;
    }

    accountSelect.onchange = updateDateLimits;
    startInput.onchange = updateDateLimits;

    async function refresh() {
        const version = ++refreshVersion;

        ready = false;
        saveButton.disabled = true;

        const backup = await createBackup(db);

        if (version !== refreshVersion) return;

        accounts = backup.accounts;

        const previousAccount = accountSelect.value;

        accountSelect.replaceChildren();

        for (const account of accounts) {
            accountSelect.add(
                new Option(
                    `${account.name} · ${account.currency}`,
                    account.id
                )
            );
        }

        if (accounts.some(a => a.id === previousAccount)) {
            accountSelect.value = previousAccount;
        }

        updateDateLimits();

        const currency =
            currencySelect.value as Account["currency"];

        const money = (value: number) =>
            `${value.toLocaleString("vi-VN")} ${currency}`;

        const loans = backup.loans
            .filter(loan => loan.currency === currency)
            .sort((a, b) =>
                b.startDate.localeCompare(a.startDate)
            );

        const accountMap = new Map(
            accounts.map(a => [a.id, a])
        );

        let payable = 0;
        let receivable = 0;

        list.replaceChildren();

        for (const loan of loans) {
            const summary = summarizeLoan(
                loan,
                backup.loanPayments
            );

            if (loan.direction === "borrowed") {
                payable += summary.remainingPrincipalMinor;
            } else {
                receivable += summary.remainingPrincipalMinor;
            }

            const row = list.insertRow();

            const values = [
                loan.direction === "borrowed"
                    ? "Vay"
                    : "Cho vay",

                loan.counterparty,

                accountMap.get(loan.accountId)?.name
                ?? loan.accountId,

                money(loan.principalMinor),

                money(summary.principalPaidMinor),

                money(summary.remainingPrincipalMinor),

                `${loan.annualRateBps / 100}%`,

                loan.startDate,

                loan.dueDate ?? "Không kỳ hạn",

                summary.status === "settled"
                    ? "Đã hết nợ gốc"
                    : "Đang theo dõi",
            ];

            for (const value of values) {
                row.insertCell().textContent = value;
            }
        }

        totals.textContent =
            `Nợ gốc phải trả: ${money(payable)} · ` +
            `Gốc phải thu: ${money(receivable)} · ` +
            `Giá trị ròng khoản vay: ${money(receivable - payable)}`;

        if (loans.length === 0) {
            const cell = list.insertRow().insertCell();

            cell.colSpan = 10;

            cell.textContent = "Chưa có khoản vay.";
        }

        status.textContent = accounts.length === 0
            ? "Hãy tạo tài khoản trước."
            : `Có ${loans.length} khoản vay.`;

        ready = accounts.length > 0;

        saveButton.disabled = writing || !ready;
    }

    function reportError(error: unknown) {
        status.textContent =
            error instanceof Error
                ? error.message
                : "Thao tác thất bại.";
    }

    currencySelect.onchange = () => {
        void refresh().catch(reportError);
    };

    form.onsubmit = async (event) => {
        event.preventDefault();

        if (writing || !ready) return;

        try {
            const account = accounts.find(
                a => a.id === accountSelect.value
            );

            if (!account) {
                throw new Error("Hãy chọn tài khoản.");
            }

            const loan = createLoan({
                direction:
                    directionSelect.value as LoanDirection,

                counterparty:
                    counterpartyInput.value.trim(),

                accountId: account.id,

                currency: account.currency,

                principalMinor:
                    Number(principalInput.value),

                annualRateBps:
                    parseRateBps(rateInput.value),

                startDate: startInput.value,

                dueDate: dueInput.value || undefined,

                note: noteInput.value.trim(),
            });

            const confirmed = window.confirm(
                `Xác nhận ${loan.direction === "borrowed"
                    ? "nhận tiền vay"
                    : "cho vay"
                }?\n\n` +

                `Đối tác: ${loan.counterparty}\n` +

                `Số tiền: ${loan.principalMinor.toLocaleString("vi-VN")
                } ${loan.currency}\n\n` +

                "Số dư tài khoản sẽ thay đổi."
            );

            if (!confirmed) return;

            writing = true;
            saveButton.disabled = true;
            currencySelect.disabled = true;

            await saveLoan(db, loan, today());

            form.reset();

            startInput.value = today();
            rateInput.value = "0";

            currencySelect.value = loan.currency;

            try {
                await refresh();

                status.textContent =
                    "Đã tạo khoản vay thành công.";

            } catch {
                status.textContent =
                    "Đã lưu khoản vay nhưng chưa tải lại được dữ liệu.";
            }

        } catch (error) {
            reportError(error);

        } finally {
            writing = false;
            currencySelect.disabled = false;
            saveButton.disabled = !ready;
        }
    };

    await refresh();
}

start().catch(error => {
    status.textContent =
        error instanceof Error
            ? error.message
            : "Không mở được database.";
});