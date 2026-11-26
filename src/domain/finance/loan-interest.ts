import type {
    Loan,
    LoanPayment,
} from "./debt";

import {
    summarizeLoan,
} from "./debt.js";

const DAY_MS = 86_400_000;

function dayNumber(value: string): number {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new Error("Ngày không hợp lệ.");
    }

    const date = new Date(`${value}T00:00:00Z`);

    if (
        !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 10) !== value
    ) {
        throw new Error("Ngày không hợp lệ.");
    }

    return date.getTime() / DAY_MS;
}

export function daysBetween(
    from: string,
    to: string
): number {
    return dayNumber(to) - dayNumber(from);
}

export interface LoanInterestSummary {
    asOf: string;
    estimatedInterestMinor: number;
    interestPaidMinor: number;
    estimatedUnpaidInterestMinor: number;
    interestPaidAboveEstimateMinor: number;
}

export function estimateLoanInterest(
    loan: Loan,
    payments: readonly LoanPayment[],
    asOf: string
): LoanInterestSummary {

    summarizeLoan(loan, payments);

    const end = dayNumber(asOf);
    const start = dayNumber(loan.startDate);

    if (end < start) {
        return {
            asOf,
            estimatedInterestMinor: 0,
            interestPaidMinor: 0,
            estimatedUnpaidInterestMinor: 0,
            interestPaidAboveEstimateMinor: 0,
        };
    }

    const history = payments
        .filter(p =>
            p.loanId === loan.id &&
            p.date <= asOf
        )
        .sort((a, b) =>
            a.date.localeCompare(b.date)
        );

    const summary = summarizeLoan(
        loan,
        history
    );

    let outstanding = loan.principalMinor;

    let cursor = start;

    let numerator = 0n;

    const rate = BigInt(loan.annualRateBps);

    const denominator = 3_650_000n;

    for (const payment of history) {
        const paymentDay = dayNumber(
            payment.date
        );

        const days = paymentDay - cursor;

        numerator +=
            BigInt(outstanding) *
            rate *
            BigInt(days);

        outstanding -= payment.principalMinor;

        cursor = paymentDay;
    }

    numerator +=
        BigInt(outstanding) *
        rate *
        BigInt(end - cursor);

    // Làm tròn một lần tại cuối phép tính.
    const rounded =
        (numerator + denominator / 2n) /
        denominator;

    if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error(
            "Tiền lãi vượt giới hạn an toàn."
        );
    }

    const estimatedInterestMinor =
        Number(rounded);

    const interestPaidMinor =
        summary.interestPaidMinor;

    return {
        asOf,

        estimatedInterestMinor,

        interestPaidMinor,

        estimatedUnpaidInterestMinor:
            Math.max(
                0,
                estimatedInterestMinor -
                interestPaidMinor
            ),

        interestPaidAboveEstimateMinor:
            Math.max(
                0,
                interestPaidMinor -
                estimatedInterestMinor
            ),
    };
}

export type MaturityStatus =
    | "notStarted"
    | "settled"
    | "noDueDate"
    | "active"
    | "dueSoon"
    | "dueToday"
    | "overdue";

export interface MaturitySummary {
    status: MaturityStatus;
    daysRemaining: number | null;
    label: string;
}

export function getLoanMaturity(
    loan: Loan,
    payments: readonly LoanPayment[],
    asOf: string
): MaturitySummary {

    const elapsed = daysBetween(
        loan.startDate,
        asOf
    );

    if (elapsed < 0) {
        return {
            status: "notStarted",
            daysRemaining: null,
            label: "Chưa bắt đầu",
        };
    }

    const summary = summarizeLoan(
        loan,
        payments.filter(p => p.date <= asOf)
    );

    if (summary.remainingPrincipalMinor === 0) {
        return {
            status: "settled",
            daysRemaining: null,
            label: "Đã hết nợ gốc",
        };
    }

    if (!loan.dueDate) {
        return {
            status: "noDueDate",
            daysRemaining: null,
            label: "Không kỳ hạn",
        };
    }

    const daysRemaining = daysBetween(
        asOf,
        loan.dueDate
    );

    if (daysRemaining < 0) {
        return {
            status: "overdue",
            daysRemaining,
            label:
                `Quá hạn ${-daysRemaining} ngày`,
        };
    }

    if (daysRemaining === 0) {
        return {
            status: "dueToday",
            daysRemaining,
            label: "Đến hạn hôm nay",
        };
    }

    if (daysRemaining <= 7) {
        return {
            status: "dueSoon",
            daysRemaining,
            label:
                `Sắp đến hạn (${daysRemaining} ngày)`,
        };
    }

    return {
        status: "active",
        daysRemaining,
        label:
            `Còn ${daysRemaining} ngày`,
    };
}