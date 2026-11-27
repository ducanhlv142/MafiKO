import {
    describe,
    it,
    expect,
} from "vitest";

import {
    createDefaultCategories,
    createCategoryCatalog,
    assertValidCategoryCatalog,
    addCustomCategory,
    updateCategoryDefinition,
    normalizeCategoryName,
    isBuiltinCategory,
    isProtectedCategory,
} from "../../src/domain/finance/category-catalog.js";

describe("Dynamic Category Engine", () => {

    it("preserves all legacy category IDs", () => {

        const records =
            createDefaultCategories();

        expect(records).toHaveLength(11);

        const catalog =
            createCategoryCatalog(records);

        expect(
            catalog.getLabel("food")
        ).toBe("Ăn uống");

        expect(
            catalog.get("salary").kind
        ).toBe("income");

        expect(
            catalog.list("expense")
        ).toHaveLength(6);

        expect(
            catalog.list("income")
        ).toHaveLength(5);
    });

    it("identifies built-in and protected categories", () => {

        expect(
            isBuiltinCategory("food")
        ).toBe(true);

        expect(
            isProtectedCategory("food")
        ).toBe(false);

        expect(
            isProtectedCategory("loanCost")
        ).toBe(true);

        expect(
            isProtectedCategory("loanIncome")
        ).toBe(true);

        expect(
            isProtectedCategory("savingsInterest")
        ).toBe(true);
    });

    it("normalizes equivalent category names", () => {

        expect(
            normalizeCategoryName(
                "  CÀ   PHÊ  "
            )
        ).toBe("cà phê");
    });

    it("creates custom categories", () => {

        const records = addCustomCategory(
            createDefaultCategories(),
            "expense",
            "Cà phê"
        );

        const custom =
            records[records.length - 1];

        expect(custom.id)
            .toMatch(/^custom-/);

        expect(custom.name)
            .toBe("Cà phê");

        expect(custom.archived)
            .toBe(false);

        expect(records)
            .toHaveLength(12);
    });

    it("creates valid child categories", () => {

        const records = addCustomCategory(
            createDefaultCategories(),
            "expense",
            "Cà phê",
            "food"
        );

        const child =
            records[records.length - 1];

        expect(child.parentId)
            .toBe("food");

        expect(() =>
            assertValidCategoryCatalog(records)
        ).not.toThrow();
    });

    it("rejects duplicate category names", () => {

        expect(() => addCustomCategory(
            createDefaultCategories(),
            "expense",
            "  ĂN UỐNG  "
        )).toThrow();
    });

    it("rejects duplicate category IDs", () => {

        const records =
            createDefaultCategories();

        expect(() =>
            assertValidCategoryCatalog([
                ...records,
                { ...records[0] },
            ])
        ).toThrow();
    });

    it("rejects categories with unknown parents", () => {

        expect(() => addCustomCategory(
            createDefaultCategories(),
            "expense",
            "Cà phê",
            "missing-parent"
        )).toThrow();
    });

    it("rejects cross-kind parent relationships", () => {

        expect(() => addCustomCategory(
            createDefaultCategories(),
            "expense",
            "Cà phê",
            "salary"
        )).toThrow();
    });

    it("rejects circular category relationships", () => {

        const records = addCustomCategory(
            createDefaultCategories(),
            "expense",
            "Cà phê",
            "food"
        );

        const child =
            records[records.length - 1];

        expect(() =>
            updateCategoryDefinition(
                records,
                "food",
                {
                    name: "Ăn uống",

                    parentId: child.id,

                    archived: false,
                }
            )
        ).toThrow();
    });

    it("renames categories without changing their IDs", () => {

        const original =
            createDefaultCategories();

        const next =
            updateCategoryDefinition(
                original,
                "food",
                {
                    name: "Ẩm thực",

                    archived: false,
                }
            );

        const catalog =
            createCategoryCatalog(next);

        expect(catalog.get("food")).toEqual({
            id: "food",

            kind: "expense",

            name: "Ẩm thực",

            archived: false,

            parentId: undefined,
        });

        expect(
            createCategoryCatalog(original)
                .getLabel("food")
        ).toBe("Ăn uống");
    });

    it("preserves historical access to archived categories", () => {

        const records =
            updateCategoryDefinition(
                createDefaultCategories(),
                "food",
                {
                    name: "Ăn uống",

                    archived: true,
                }
            );

        const catalog =
            createCategoryCatalog(records);

        expect(
            catalog.getLabel("food")
        ).toBe("Ăn uống");

        expect(
            catalog.list("expense")
                .some(c => c.id === "food")
        ).toBe(false);

        expect(
            catalog.list("expense", true)
                .some(c => c.id === "food")
        ).toBe(true);

        expect(() =>
            catalog.requireAssignable(
                "food",
                "expense"
            )
        ).toThrow();
    });

    it("rejects archiving a parent with active children", () => {

        const records = addCustomCategory(
            createDefaultCategories(),
            "expense",
            "Cà phê",
            "food"
        );

        expect(() =>
            updateCategoryDefinition(
                records,
                "food",
                {
                    name: "Ăn uống",

                    archived: true,
                }
            )
        ).toThrow();
    });

    it("protects system-generated categories", () => {

        const records =
            createDefaultCategories();

        expect(() =>
            updateCategoryDefinition(
                records,
                "loanCost",
                {
                    name: "Lãi và phí vay",

                    archived: true,
                }
            )
        ).toThrow();

        expect(() =>
            assertValidCategoryCatalog(
                records.filter(
                    c => c.id !== "savingsInterest"
                )
            )
        ).toThrow();
    });

    it("does not expose mutable catalog references", () => {

        const records =
            createDefaultCategories();

        const catalog =
            createCategoryCatalog(records);

        const food = catalog.get("food");

        food.name = "Modified";

        expect(
            catalog.getLabel("food")
        ).toBe("Ăn uống");
    });
});