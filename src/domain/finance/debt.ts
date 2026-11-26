import type { Account } from "./account";

export type LoanDirection = "borrowed" | "lent";

export interface Loan {
    id: string;
    direction: LoanDirection;
    counterparty: string;
    accountId: string;
    currency: Account["currency"];

    principalMinor: number;
    startDate: string;
    dueDate?: string;

    annualRateBps: number;
    note: string;
}

export interface LoanPayment {
    id: string;
    loanId: string;
    accountId: string;

    principalMinor: number;
    interestMinor: number;
    feeMinor: number;

    date: string;
    note: string;
}

export interface LoanSummary {
    principalMinor: number;
    principalPaidMinor: number;
    remainingPrincipalMinor: number;

    interestPaidMinor: number;
    feePaidMinor: number;
    totalPaidMinor: number;

    status: "active" | "settled";
}

function validDate(value: unknown): value is string {
    if (
        typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
        return false;
    }

    const date = new Date(`${value}T00:00:00Z`);

    return Number.isFinite(date.getTime()) &&
        date.toISOString().slice(0, 10) === value;
}

function validMoney(value: unknown): value is number {
    return typeof value === "number" &&
        Number.isSafeInteger(value) &&
        value >= 0;
}

function validText(value: unknown): value is string {
    return typeof value === "string" &&
        value.trim().length > 0;
}

function safeAdd(a: number, b: number): number {
    const result = a + b;

    if (!Number.isSafeInteger(result)) {
        throw new Error("Số tiền vượt giới hạn an toàn.");
    }

    return result;
}

export function isValidLoan(value: unknown): value is Loan {
    if (!value || typeof value !== "object") {
        return false;
    }

    const loan = value as Loan;

    return (
        validText(loan.id) &&
        validText(loan.counterparty) &&
        validText(loan.accountId) &&

        (loan.direction === "borrowed" ||
            loan.direction === "lent") &&

        (loan.currency === "VND" ||
            loan.currency === "JPY") &&

        validMoney(loan.principalMinor) &&
        loan.principalMinor > 0 &&

        validDate(loan.startDate) &&

        (
            loan.dueDate === undefined ||
            (
                validDate(loan.dueDate) &&
                loan.dueDate >= loan.startDate
            )
        ) &&

        validMoney(loan.annualRateBps) &&
        typeof loan.note === "string"
    );
}

export function paymentTotal(payment: LoanPayment): number {
    return safeAdd(
        safeAdd(
            payment.principalMinor,
            payment.interestMinor
        ),
        payment.feeMinor
    );
}

export function isValidLoanPayment(
    value: unknown
): value is LoanPayment {
    if (!value || typeof value !== "object") {
        return false;
    }

    const p = value as LoanPayment;

    return (
        validText(p.id) &&
        validText(p.loanId) &&
        validText(p.accountId) &&

        validMoney(p.principalMinor) &&
        validMoney(p.interestMinor) &&
        validMoney(p.feeMinor) &&

        Number.isSafeInteger(
            p.principalMinor +
            p.interestMinor +
            p.feeMinor
        ) &&

        p.principalMinor +
        p.interestMinor +
        p.feeMinor > 0 &&

        validDate(p.date) &&
        typeof p.note === "string"
    );
}

export function createLoan(
    input: Omit<Loan, "id">
): Loan {
    const loan: Loan = {
        ...input,
        id: crypto.randomUUID(),
    };

    if (!isValidLoan(loan)) {
        throw new Error("Khoản vay không hợp lệ.");
    }

    return loan;
}

export function createLoanPayment(
    input: Omit<LoanPayment, "id">
): LoanPayment {
    const payment: LoanPayment = {
        ...input,
        id: crypto.randomUUID(),
    };

    if (!isValidLoanPayment(payment)) {
        throw new Error("Khoản thanh toán không hợp lệ.");
    }

    return payment;
}

export function summarizeLoan(
    loan: Loan,
    payments: readonly LoanPayment[]
): LoanSummary {
    if (!isValidLoan(loan)) {
        throw new Error("Khoản vay không hợp lệ.");
    }

    let principalPaidMinor = 0;
    let interestPaidMinor = 0;
    let feePaidMinor = 0;

    const seen = new Set<string>();

    for (const payment of payments) {
        if (payment.loanId !== loan.id) continue;

        if (
            !isValidLoanPayment(payment) ||
            payment.date < loan.startDate ||
            seen.has(payment.id)
        ) {
            throw new Error("Khoản thanh toán không hợp lệ.");
        }

        seen.add(payment.id);

        principalPaidMinor = safeAdd(
            principalPaidMinor,
            payment.principalMinor
        );

        interestPaidMinor = safeAdd(
            interestPaidMinor,
            payment.interestMinor
        );

        feePaidMinor = safeAdd(
            feePaidMinor,
            payment.feeMinor
        );
    }

    if (principalPaidMinor > loan.principalMinor) {
        throw new Error("Tiền gốc đã trả vượt số tiền vay.");
    }

    const remainingPrincipalMinor =
        loan.principalMinor - principalPaidMinor;

    const totalPaidMinor = safeAdd(
        safeAdd(principalPaidMinor, interestPaidMinor),
        feePaidMinor
    );

    return {
        principalMinor: loan.principalMinor,
        principalPaidMinor,
        remainingPrincipalMinor,
        interestPaidMinor,
        feePaidMinor,
        totalPaidMinor,

        status: remainingPrincipalMinor === 0
            ? "settled"
            : "active",
    };
}

export function loanCashMovement(
    loan: Loan,
    accountId: string
): number {
    if (loan.accountId !== accountId) return 0;

    return loan.direction === "borrowed"
        ? loan.principalMinor
        : -loan.principalMinor;
}

export function paymentCashMovement(
    loan: Loan,
    payment: LoanPayment,
    accountId: string
): number {
    if (
        payment.loanId !== loan.id ||
        payment.accountId !== accountId
    ) {
        return 0;
    }

    const total = paymentTotal(payment);

    return loan.direction === "borrowed"
        ? -total
        : total;
}