export const categories = {
    expense: {
        food: "Ăn uống",
        transport: "Di chuyển",
        housing: "Nhà ở",
        shopping: "Mua sắm",
        loanCost: "Lãi và phí vay",
        otherExpense: "Chi khác",
    },
    income: {
        salary: "Lương",
        bonus: "Thưởng",
        loanIncome: "Lãi và phí cho vay",
        otherIncome: "Thu khác",
    },
} as const;

export type ExpenseCategoryId =
    keyof typeof categories.expense;

export type IncomeCategoryId =
    keyof typeof categories.income;