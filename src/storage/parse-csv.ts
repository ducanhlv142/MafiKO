export function parseCsv(content: string): string[][] {
    const text = content.replace(/^\uFEFF/, "");

    const rows: string[][] = [];

    let row: string[] = [];
    let field = "";
    let inQuotes = false;
    let closedQuote = false;

    function finishField() {
        row.push(field);
        field = "";
        closedQuote = false;
    }

    function finishRow() {
        finishField();
        rows.push(row);
        row = [];
    }

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const next = text[i + 1];

        if (inQuotes) {
            if (char === '"') {
                if (next === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                    closedQuote = true;
                }
            } else {
                field += char;
            }

            continue;
        }

        if (char === ",") {
            finishField();
        } else if (char === "\n" || char === "\r") {
            if (char === "\r" && next === "\n") {
                i++;
            }

            finishRow();
        } else if (closedQuote) {
            throw new Error(
                `CSV không hợp lệ tại bản ghi ${rows.length + 1}.`
            );
        } else if (char === '"') {
            if (field.length > 0) {
                throw new Error(
                    `Dấu ngoặc kép không hợp lệ tại bản ghi ${rows.length + 1}.`
                );
            }

            inQuotes = true;
        } else {
            field += char;
        }
    }

    if (inQuotes) {
        throw new Error("CSV có dấu ngoặc kép chưa đóng.");
    }

    if (field.length > 0 || row.length > 0 || closedQuote) {
        finishRow();
    }

    return rows;
}