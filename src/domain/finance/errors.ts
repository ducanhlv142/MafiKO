export const domainErrorMessages = {
    INVALID_AMOUNT: "Số tiền không hợp lệ.",
    INVALID_DATE: "Ngày không hợp lệ.",
    INVALID_ACCOUNT: "Tài khoản không hợp lệ.",
    INVALID_TRANSACTION: "Giao dịch không hợp lệ.",
    INVALID_TRANSFER: "Khoản chuyển tiền không hợp lệ.",
    INVALID_BUDGET: "Ngân sách không hợp lệ.",
    INVALID_LOAN: "Khoản vay không hợp lệ.",
    INVALID_LOAN_PAYMENT: "Khoản thanh toán không hợp lệ.",
    INVALID_SAVINGS: "Sổ tiết kiệm không hợp lệ.",
    INVALID_SAVINGS_MOVEMENT: "Biến động tiết kiệm không hợp lệ.",
    INVALID_BACKUP: "Bản sao lưu không hợp lệ.",

    UNKNOWN_CURRENCY: "Không nhận diện được tiền tệ.",
    CURRENCY_MISMATCH: "Hai loại tiền tệ không tương thích.",
    SAME_ACCOUNT: "Tài khoản gửi và nhận phải khác nhau.",

    MONEY_OVERFLOW: "Số tiền vượt giới hạn an toàn.",
    MONEY_FORMAT: "Định dạng số tiền không hợp lệ.",
    MONEY_PRECISION: "Số chữ số thập phân không hợp lệ.",
    INVALID_RATIO: "Tỷ lệ không hợp lệ.",

    ACCOUNT_NOT_FOUND: "Không tìm thấy tài khoản.",
    RECORD_NOT_FOUND: "Không tìm thấy bản ghi.",
    RECORD_CONFLICT: "Dữ liệu đã thay đổi.",
    UNBALANCED_LEDGER_EVENT: "Bút toán tài chính không cân bằng.",
    LEDGER_POSITION_MISMATCH: "Giá trị Ledger không khớp với dữ liệu nghiệp vụ.",
} as const;

export type DomainErrorCode =
    keyof typeof domainErrorMessages;

export class DomainError extends Error {

    readonly code: DomainErrorCode;

    constructor(
        code: DomainErrorCode,
        message: string = domainErrorMessages[code]
    ) {
        super(message);

        this.name = "DomainError";
        this.code = code;
    }
}