import type { Account } from "../domain/finance/account";
import type {
    Loan,
    LoanPayment,
    LoanDirection,
} from "../domain/finance/debt";
import {
    createLoan,
    createLoanPayment,
    paymentTotal,
    summarizeLoan,
} from "../domain/finance/debt.js";
import {
    estimateLoanInterest,
    getLoanMaturity,
} from "../domain/finance/loan-interest.js";
import { openDatabase } from "./database.js";
import { createBackup } from "./backup.js";
import {
    populateCurrencySelect,
} from "../presentation/shared/currency-select.js";
import { FinanceService } from
    "../application/services/finance-service.js";

import { IndexedDbFinanceRepository } from
    "../infrastructure/indexeddb/finance-repository.js";

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

const loanAlerts =
    document.querySelector<HTMLUListElement>(
        "#loan-alerts"
    )!;

const interestDate =
    document.querySelector<HTMLInputElement>(
        "#loan-interest-date"
    )!;

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

    const finance = new FinanceService(
        new IndexedDbFinanceRepository(db)
    );

    populateCurrencySelect(currencySelect);

    let accounts: Account[] = [];
    let writing = false;
    let ready = false;
    let refreshVersion = 0;

    const paymentDialog =
        document.querySelector<HTMLDialogElement>(
            "#payment-dialog"
        )!;

    const paymentForm =
        document.querySelector<HTMLFormElement>(
            "#payment-form"
        )!;

    const paymentTitle =
        document.querySelector<HTMLElement>(
            "#payment-title"
        )!;

    const paymentSummary =
        document.querySelector<HTMLElement>(
            "#payment-summary"
        )!;

    const paymentAccount =
        document.querySelector<HTMLSelectElement>(
            "#payment-account"
        )!;

    const paymentPrincipal =
        document.querySelector<HTMLInputElement>(
            "#payment-principal"
        )!;

    const paymentInterest =
        document.querySelector<HTMLInputElement>(
            "#payment-interest"
        )!;

    const paymentFee =
        document.querySelector<HTMLInputElement>(
            "#payment-fee"
        )!;

    const paymentDate =
        document.querySelector<HTMLInputElement>(
            "#payment-date"
        )!;

    const paymentNote =
        document.querySelector<HTMLInputElement>(
            "#payment-note"
        )!;

    const paymentTotalText =
        document.querySelector<HTMLElement>(
            "#payment-total"
        )!;

    const paymentStatus =
        document.querySelector<HTMLElement>(
            "#payment-status"
        )!;

    const paymentHistory =
        document.querySelector<HTMLUListElement>(
            "#payment-history"
        )!;

    const paymentSave =
        document.querySelector<HTMLButtonElement>(
            "#payment-save"
        )!;

    const paymentCancel =
        document.querySelector<HTMLButtonElement>(
            "#payment-cancel"
        )!;

    let selectedLoan: Loan | null = null;

    let editingLoan: Loan | null = null;

    let editingPayment: LoanPayment | null = null;

    const loanEditCancel =
        document.querySelector<HTMLButtonElement>(
            "#loan-edit-cancel"
        )!;

    startInput.value = today();
    startInput.max = today();
    interestDate.value = today();
    interestDate.min = today();

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

    function clearLoanEdit() {
        editingLoan = null;

        form.reset();

        directionSelect.disabled = false;
        accountSelect.disabled = false;
        startInput.disabled = false;

        startInput.value = today();
        startInput.max = today();

        rateInput.value = "0";

        saveButton.textContent = "Lưu khoản vay";

        loanEditCancel.hidden = true;

        updateDateLimits();
    }

    function openLoanEdit(loan: Loan) {
        if (writing || !ready) return;

        editingLoan = loan;

        directionSelect.value = loan.direction;

        counterpartyInput.value =
            loan.counterparty;

        accountSelect.value =
            loan.accountId;

        principalInput.value =
            String(loan.principalMinor);

        rateInput.value =
            String(loan.annualRateBps / 100);

        startInput.value =
            loan.startDate;

        dueInput.value =
            loan.dueDate ?? "";

        noteInput.value =
            loan.note;

        directionSelect.disabled = true;
        accountSelect.disabled = true;
        startInput.disabled = true;

        saveButton.textContent = "Cập nhật khoản vay";

        loanEditCancel.hidden = false;

        updateDateLimits();

        form.scrollIntoView({
            behavior: "smooth",
            block: "center",
        });

        counterpartyInput.focus();

        status.textContent =
            `Đang chỉnh sửa: ${loan.counterparty}`;
    }

    loanEditCancel.onclick = () => {
        if (writing) return;

        clearLoanEdit();

        status.textContent =
            "Đã hủy chỉnh sửa.";
    };

    function updatePaymentTotal() {
        if (!selectedLoan) return;

        const total =
            Number(paymentPrincipal.value) +
            Number(paymentInterest.value) +
            Number(paymentFee.value);

        paymentTotalText.textContent =
            `Tổng thanh toán: ${total.toLocaleString("vi-VN")} ` +
            selectedLoan.currency;
    }

    function updatePaymentDateLimits() {
        if (!selectedLoan) return;

        const account = accounts.find(
            a => a.id === paymentAccount.value
        );

        paymentDate.min =
            account &&
                account.openingBalanceDate > selectedLoan.startDate
                ? account.openingBalanceDate
                : selectedLoan.startDate;

        paymentDate.max = today();
    }

    function openPayment(
        loan: Loan,
        payments: readonly LoanPayment[]
    ) {
        if (writing || !ready) return;

        selectedLoan = loan;

        editingPayment = null;

        paymentSave.textContent =
            "Xác nhận thanh toán";

        const summary = summarizeLoan(
            loan,
            payments
        );

        const borrowed =
            loan.direction === "borrowed";

        const money = (value: number) =>
            `${value.toLocaleString("vi-VN")} ${loan.currency}`;

        paymentForm.reset();

        paymentStatus.textContent = "";

        paymentTitle.textContent = borrowed
            ? `Trả nợ · ${loan.counterparty}`
            : `Thu hồi nợ · ${loan.counterparty}`;

        paymentSummary.textContent =
            `Gốc còn lại: ${money(summary.remainingPrincipalMinor)} · ` +
            `Lãi đã thanh toán: ${money(summary.interestPaidMinor)} · ` +
            `Phí đã thanh toán: ${money(summary.feePaidMinor)}`;

        paymentPrincipal.max =
            String(summary.remainingPrincipalMinor);

        paymentAccount.replaceChildren();

        for (const account of accounts) {
            if (account.currency !== loan.currency) continue;

            paymentAccount.add(
                new Option(
                    `${account.name} · ${account.currency}`,
                    account.id
                )
            );
        }

        paymentAccount.value = loan.accountId;

        paymentDate.value = today();

        updatePaymentDateLimits();
        updatePaymentTotal();

        paymentHistory.replaceChildren();

        const history = payments
            .filter(p => p.loanId === loan.id)
            .sort((a, b) => b.date.localeCompare(a.date));

        for (const payment of history) {
            const item = document.createElement("li");

            item.textContent =
                `${payment.date} · ` +
                `Gốc: ${money(payment.principalMinor)} · ` +
                `Lãi: ${money(payment.interestMinor)} · ` +
                `Phí: ${money(payment.feeMinor)} · ` +
                `Tổng: ${money(paymentTotal(payment))}` +
                (payment.note ? ` · ${payment.note}` : "");

            const editButton =
                document.createElement("button");

            editButton.type = "button";
            editButton.textContent = "Sửa";
            editButton.style.color = "#2563eb";
            editButton.style.marginLeft = "8px";

            editButton.onclick = () => {
                if (writing) return;

                editingPayment = payment;

                paymentAccount.value =
                    payment.accountId;

                paymentPrincipal.value =
                    String(payment.principalMinor);

                paymentInterest.value =
                    String(payment.interestMinor);

                paymentFee.value =
                    String(payment.feeMinor);

                paymentDate.value =
                    payment.date;

                paymentNote.value =
                    payment.note;

                paymentPrincipal.max = String(
                    summary.remainingPrincipalMinor +
                    payment.principalMinor
                );

                paymentTitle.textContent =
                    `Sửa thanh toán · ${loan.counterparty}`;

                paymentSave.textContent =
                    "Cập nhật thanh toán";

                paymentStatus.textContent =
                    "Đang chỉnh sửa thanh toán.";

                updatePaymentDateLimits();
                updatePaymentTotal();

                paymentPrincipal.focus();
            };

            const deleteButton =
                document.createElement("button");

            deleteButton.type = "button";
            deleteButton.textContent = "Xóa";
            deleteButton.style.color = "#dc2626";
            deleteButton.style.marginLeft = "8px";

            deleteButton.onclick = async () => {
                if (writing) return;

                const confirmed = window.confirm(
                    `Xóa thanh toán ngày ${payment.date}?\n\n` +

                    `Tổng tiền: ${money(paymentTotal(payment))}\n\n` +

                    "Số dư, dư nợ và báo cáo thu chi sẽ được tính lại.\n" +

                    "Thao tác không thể hoàn tác."
                );

                if (!confirmed) return;

                writing = true;

                paymentSave.disabled = true;
                paymentCancel.disabled = true;
                saveButton.disabled = true;
                currencySelect.disabled = true;

                try {
                    await finance.mutateDebt(
                        loan,
                        {
                            kind: "deletePayment",
                            expected: payment,
                        },
                        today()
                    );

                    paymentDialog.close();

                    try {
                        await refresh();

                        status.textContent =
                            "Đã xóa thanh toán.";

                    } catch {
                        status.textContent =
                            "Đã xóa nhưng chưa tải lại được dữ liệu.";
                    }

                } catch (error) {
                    paymentStatus.textContent =
                        error instanceof Error
                            ? error.message
                            : "Xóa thanh toán thất bại.";

                } finally {
                    writing = false;

                    paymentSave.disabled = false;
                    paymentCancel.disabled = false;
                    currencySelect.disabled = false;
                    saveButton.disabled = !ready;
                }
            };

            item.append(editButton, deleteButton);

            paymentHistory.append(item);
        }

        if (history.length === 0) {
            const item = document.createElement("li");

            item.textContent = "Chưa có thanh toán.";

            paymentHistory.append(item);
        }

        paymentDialog.showModal();
    }

    paymentPrincipal.oninput = updatePaymentTotal;
    paymentInterest.oninput = updatePaymentTotal;
    paymentFee.oninput = updatePaymentTotal;

    paymentAccount.onchange = updatePaymentDateLimits;

    paymentCancel.onclick = () => {
        if (!writing) {
            paymentDialog.close();
        }
    };

    paymentDialog.addEventListener("cancel", event => {
        if (writing) {
            event.preventDefault();
        }
    });

    paymentDialog.addEventListener("close", () => {
        selectedLoan = null;
        editingPayment = null;
    });

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

        loanAlerts.replaceChildren();

        const currentDate = today();

        interestDate.min = currentDate;

        if (
            !interestDate.value ||
            interestDate.value < currentDate
        ) {
            interestDate.value = currentDate;
        }

        const estimateDate = interestDate.value;

        for (const loan of loans) {
            const summary = summarizeLoan(
                loan,
                backup.loanPayments
            );

            const interest = estimateLoanInterest(
                loan,
                backup.loanPayments,
                estimateDate
            );

            const maturity = getLoanMaturity(
                loan,
                backup.loanPayments,
                currentDate
            );

            const progressPercent =
                summary.principalPaidMinor /
                loan.principalMinor * 100;

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

                `${progressPercent.toFixed(1)}%`,

                money(interest.estimatedInterestMinor),

                money(interest.interestPaidMinor),

                money(interest.estimatedUnpaidInterestMinor),

                maturity.label,
            ];

            for (const value of values) {
                row.insertCell().textContent = value;
            }

            const progress =
                document.createElement("progress");

            progress.max = 100;

            progress.value = progressPercent;

            progress.style.width = "120px";

            progress.style.display = "block";

            progress.style.marginTop = "6px";

            progress.style.accentColor = "#16a34a";

            progress.setAttribute(
                "aria-label",
                "Tiến độ hoàn trả gốc"
            );

            row.cells[9].append(progress);

            const maturityCell = row.cells[13];

            switch (maturity.status) {
                case "overdue":
                case "dueToday":
                    maturityCell.style.color = "#dc2626";
                    maturityCell.style.fontWeight = "bold";
                    break;

                case "dueSoon":
                    maturityCell.style.color = "#b45309";
                    maturityCell.style.fontWeight = "bold";
                    break;

                case "active":
                case "settled":
                    maturityCell.style.color = "#15803d";
                    break;

                default:
                    maturityCell.style.color = "#64748b";
            }

            if (
                maturity.status === "overdue" ||
                maturity.status === "dueToday" ||
                maturity.status === "dueSoon"
            ) {
                const item = document.createElement("li");

                const label =
                    loan.direction === "borrowed"
                        ? "Nợ phải trả"
                        : "Khoản phải thu";

                item.textContent =
                    `${loan.counterparty} · ` +
                    `${label} · ` +
                    `${maturity.label} · ` +
                    `Gốc còn lại: ` +
                    money(summary.remainingPrincipalMinor);

                item.style.color =
                    maturity.status === "dueSoon"
                        ? "#b45309"
                        : "#dc2626";

                item.style.fontWeight = "bold";

                loanAlerts.append(item);
            }

            const actions = row.insertCell();

            const paymentButton =
                document.createElement("button");

            paymentButton.type = "button";

            paymentButton.textContent =
                loan.direction === "borrowed"
                    ? "Trả nợ"
                    : "Thu hồi nợ";

            paymentButton.style.color = "#2563eb";

            paymentButton.onclick = () => {
                openPayment(
                    loan,
                    backup.loanPayments
                );
            };

            actions.append(paymentButton);

            const editButton =
                document.createElement("button");

            editButton.type = "button";
            editButton.textContent = "Sửa";
            editButton.style.color = "#2563eb";
            editButton.style.marginLeft = "8px";

            editButton.onclick = () => {
                openLoanEdit(loan);
            };

            const deleteButton =
                document.createElement("button");

            deleteButton.type = "button";
            deleteButton.textContent = "Xóa";
            deleteButton.style.color = "#dc2626";
            deleteButton.style.marginLeft = "8px";

            deleteButton.onclick = async () => {
                if (writing || !ready || editingLoan) return;

                if (
                    backup.loanPayments.some(
                        p => p.loanId === loan.id
                    )
                ) {
                    status.textContent =
                        "Không thể xóa khoản vay còn lịch sử thanh toán.";

                    return;
                }

                const confirmed = window.confirm(
                    `Xóa khoản vay của ${loan.counterparty}?\n\n` +

                    `Tiền gốc: ${money(loan.principalMinor)}\n\n` +

                    "Biến động tiền ban đầu sẽ bị loại khỏi số dư.\n" +

                    "Thao tác không thể hoàn tác."
                );

                if (!confirmed) return;

                writing = true;

                saveButton.disabled = true;
                currencySelect.disabled = true;

                try {
                    await finance.mutateDebt(
                        loan,
                        { kind: "deleteLoan" },
                        today()
                    );

                    try {
                        await refresh();

                        status.textContent =
                            "Đã xóa khoản vay.";

                    } catch {
                        status.textContent =
                            "Đã xóa nhưng chưa tải lại được dữ liệu.";
                    }

                } catch (error) {
                    reportError(error);

                } finally {
                    writing = false;

                    currencySelect.disabled = false;
                    saveButton.disabled = !ready;
                }
            };

            actions.append(editButton, deleteButton);
        }

        totals.textContent =
            `Nợ gốc phải trả: ${money(payable)} · ` +
            `Gốc phải thu: ${money(receivable)} · ` +
            `Giá trị ròng khoản vay: ${money(receivable - payable)}`;

        if (loanAlerts.children.length === 0) {
            const item = document.createElement("li");

            item.textContent =
                "Không có khoản vay gốc sắp đến hạn hoặc quá hạn.";

            item.style.color = "#15803d";

            loanAlerts.append(item);
        }

        if (loans.length === 0) {
            const cell = list.insertRow().insertCell();

            cell.colSpan = 15;

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

    paymentForm.onsubmit = async event => {
        event.preventDefault();

        const loan = selectedLoan;

        if (!loan || writing || !ready) return;

        try {
            const draft = createLoanPayment({
                loanId: loan.id,

                accountId:
                    paymentAccount.value,

                principalMinor:
                    Number(paymentPrincipal.value),

                interestMinor:
                    Number(paymentInterest.value),

                feeMinor:
                    Number(paymentFee.value),

                date:
                    paymentDate.value,

                note:
                    paymentNote.value.trim(),
            });

            const original = editingPayment;

            const payment: LoanPayment = original
                ? {
                    ...draft,
                    id: original.id,
                }
                : draft;

            const total = paymentTotal(payment);

            const confirmed = window.confirm(
                `Xác nhận ${loan.direction === "borrowed"
                    ? "trả nợ"
                    : "thu hồi nợ"
                }?\n\n` +

                `Đối tác: ${loan.counterparty}\n` +

                `Tổng tiền: ${total.toLocaleString("vi-VN")} ` +
                `${loan.currency}\n\n` +

                "Số dư tài khoản sẽ thay đổi."
            );

            if (!confirmed) return;

            writing = true;

            paymentSave.disabled = true;
            paymentCancel.disabled = true;
            saveButton.disabled = true;
            currencySelect.disabled = true;

            paymentStatus.textContent =
                "Đang lưu thanh toán...";

            if (original) {
                await finance.mutateDebt(
                    loan,
                    {
                        kind: "updatePayment",
                        expected: original,
                        next: payment,
                    },
                    today()
                );
            } else {
                await finance.saveLoanPayment(
                    payment,
                    loan,
                    today()
                );
            }

            paymentDialog.close();

            try {
                await refresh();

                status.textContent = original
                    ? "Đã cập nhật thanh toán."
                    : loan.direction === "borrowed"
                        ? "Đã ghi nhận trả nợ."
                        : "Đã ghi nhận thu hồi nợ.";

            } catch {
                status.textContent =
                    "Đã lưu thanh toán nhưng chưa tải lại được dữ liệu.";
            }

        } catch (error) {
            paymentStatus.textContent =
                error instanceof Error
                    ? error.message
                    : "Thanh toán thất bại.";

        } finally {
            writing = false;

            paymentSave.disabled = false;
            paymentCancel.disabled = false;
            currencySelect.disabled = false;
            saveButton.disabled = !ready;
        }
    };

    currencySelect.onchange = () => {
        void refresh().catch(reportError);
    };

    interestDate.onchange = () => {
        if (!writing) {
            void refresh().catch(reportError);
        }
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

            const draft = createLoan({
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

            const original = editingLoan;

            const loan: Loan = original
                ? {
                    ...draft,
                    id: original.id,
                }
                : draft;

            const confirmed = window.confirm(
                `${original ? "Cập nhật" : "Tạo"} khoản vay?\n\n` +

                `Đối tác: ${loan.counterparty}\n` +

                `Tiền gốc: ${loan.principalMinor.toLocaleString("vi-VN")
                } ${loan.currency}\n\n` +

                "Số dư và dư nợ có thể thay đổi."
            );

            if (!confirmed) return;

            writing = true;
            saveButton.disabled = true;
            currencySelect.disabled = true;

            if (original) {
                await finance.mutateDebt(
                    original,
                    {
                        kind: "updateLoan",
                        next: loan,
                    },
                    today()
                );
            } else {
                await finance.saveLoan(loan, today());
            }

            clearLoanEdit();

            currencySelect.value = loan.currency;

            try {
                await refresh();

                status.textContent = original
                    ? "Đã cập nhật khoản vay."
                    : "Đã tạo khoản vay thành công.";

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