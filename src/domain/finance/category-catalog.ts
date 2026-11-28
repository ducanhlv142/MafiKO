import { categories } from "./category.js";

import {
    isNonEmptyString,
} from "./validation.js";

import { DomainError } from "./errors.js";

export type CategoryKind =
    | "income"
    | "expense";

export interface CategoryRecord {

    id: string;

    kind: CategoryKind;

    name: string;

    parentId?: string;

    archived: boolean;
}

const categoryKinds = [
    "expense",
    "income",
] as const;

const protectedIds: ReadonlySet<string> =
    new Set([
        "loanCost",
        "loanIncome",
        "savingsInterest",
    ]);

const builtinKinds = new Map<
    string,
    CategoryKind
>();

for (const kind of categoryKinds) {

    for (const id of Object.keys(categories[kind])) {

        builtinKinds.set(id, kind);
    }
}

// ========================================
// DEFAULT CATEGORIES
// ========================================

export function createDefaultCategories():
    CategoryRecord[] {

    const result: CategoryRecord[] = [];

    for (const kind of categoryKinds) {

        for (const [id, name] of
            Object.entries(categories[kind])) {

            result.push({

                id,

                kind,

                name,

                archived: false,
            });
        }
    }

    return result;
}

export function isBuiltinCategory(
    id: string
): boolean {

    return builtinKinds.has(id);
}

export function isProtectedCategory(
    id: string
): boolean {

    return protectedIds.has(id);
}

// ========================================
// BASIC VALIDATION
// ========================================

export function normalizeCategoryName(
    name: string
): string {

    return name
        .normalize("NFKC")
        .trim()
        .replace(/\s+/gu, " ")
        .toLowerCase();
}

export function isCategoryId(
    value: unknown
): value is string {

    if (typeof value !== "string") {
        return false;
    }

    return (
        builtinKinds.has(value) ||

        /^custom-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
            .test(value)
    );
}

export function isValidCategoryRecord(
    value: unknown
): value is CategoryRecord {

    if (!value || typeof value !== "object") {
        return false;
    }

    const category = value as CategoryRecord;

    return (

        isCategoryId(category.id) &&

        (
            category.kind === "income" ||
            category.kind === "expense"
        ) &&

        isNonEmptyString(category.name) &&

        category.name.length <= 80 &&

        (
            category.parentId === undefined ||

            isCategoryId(category.parentId)
        ) &&

        typeof category.archived === "boolean"
    );
}

// ========================================
// CATALOG VALIDATION
// ========================================

export function assertValidCategoryCatalog(
    records: readonly CategoryRecord[]
): void {

    const byId = new Map<
        string,
        CategoryRecord
    >();

    const names = new Set<string>();

    for (const category of records) {

        if (!isValidCategoryRecord(category)) {

            throw new DomainError(
                "INVALID_CATEGORY"
            );
        }

        if (byId.has(category.id)) {

            throw new DomainError(
                "CATEGORY_CONFLICT"
            );
        }

        const nameKey =
            `${category.kind}:` +
            normalizeCategoryName(category.name);

        if (names.has(nameKey)) {

            throw new DomainError(
                "CATEGORY_CONFLICT"
            );
        }

        names.add(nameKey);

        byId.set(
            category.id,
            category
        );

        if (isBuiltinCategory(category.id)) {

            if (
                builtinKinds.get(category.id) !==
                category.kind
            ) {
                throw new DomainError(
                    "CATEGORY_PROTECTED"
                );
            }
        }

        if (
            isProtectedCategory(category.id) &&
            category.archived
        ) {
            throw new DomainError(
                "CATEGORY_PROTECTED"
            );
        }
    }

    // Every legacy system category must exist.

    for (const id of builtinKinds.keys()) {

        if (!byId.has(id)) {

            throw new DomainError(
                "CATEGORY_PROTECTED"
            );
        }
    }

    // Parent relationship validation.

    for (const category of records) {

        if (category.parentId === undefined) {
            continue;
        }

        const parent = byId.get(
            category.parentId
        );

        if (
            !parent ||
            parent.kind !== category.kind
        ) {
            throw new DomainError(
                "INVALID_CATEGORY"
            );
        }

        if (
            parent.archived &&
            !category.archived
        ) {
            throw new DomainError(
                "CATEGORY_ARCHIVED"
            );
        }

        const visited = new Set<string>([
            category.id,
        ]);

        let current = parent;

        while (true) {

            if (visited.has(current.id)) {

                throw new DomainError(
                    "INVALID_CATEGORY"
                );
            }

            visited.add(current.id);

            if (current.parentId === undefined) {
                break;
            }

            const next = byId.get(
                current.parentId
            );

            if (
                !next ||
                next.kind !== category.kind
            ) {
                throw new DomainError(
                    "INVALID_CATEGORY"
                );
            }

            current = next;
        }
    }
}

// ========================================
// READ-ONLY CATEGORY CATALOG
// ========================================

export function createCategoryCatalog(
    records: readonly CategoryRecord[]
) {

    assertValidCategoryCatalog(records);

    const byId = new Map(
        records.map(category => [
            category.id,
            { ...category },
        ])
    );

    function requireCategory(
        id: string,
        kind?: CategoryKind
    ): CategoryRecord {

        const category = byId.get(id);

        if (!category) {

            throw new DomainError(
                "CATEGORY_NOT_FOUND"
            );
        }

        if (
            kind !== undefined &&
            category.kind !== kind
        ) {
            throw new DomainError(
                "INVALID_CATEGORY"
            );
        }

        return category;
    }

    return {

        get(
            id: string,
            kind?: CategoryKind
        ): CategoryRecord {

            return {
                ...requireCategory(id, kind),
            };
        },

        list(
            kind: CategoryKind,
            includeArchived = false
        ): CategoryRecord[] {

            return [...byId.values()]
                .filter(category =>
                    category.kind === kind &&
                    (
                        includeArchived ||
                        !category.archived
                    )
                )
                .map(category => ({
                    ...category,
                }));
        },

        requireAssignable(
            id: string,
            kind: CategoryKind
        ): CategoryRecord {

            const category =
                requireCategory(id, kind);

            if (category.archived) {

                throw new DomainError(
                    "CATEGORY_ARCHIVED"
                );
            }

            return {
                ...category,
            };
        },

        getLabel(id: string): string {

            return requireCategory(id).name;
        },
    };
}

export interface CategoryChanges {

    name: string;

    parentId?: string;

    archived: boolean;
}

export function addCustomCategory(
    records: readonly CategoryRecord[],
    kind: CategoryKind,
    name: string,
    parentId?: string
): CategoryRecord[] {

    assertValidCategoryCatalog(records);

    const category: CategoryRecord = {

        id: `custom-${crypto.randomUUID()}`,

        kind,

        name: name.trim(),

        parentId,

        archived: false,
    };

    const next = [
        ...records.map(item => ({ ...item })),
        category,
    ];

    assertValidCategoryCatalog(next);

    return next;
}

export function updateCategoryDefinition(
    records: readonly CategoryRecord[],
    id: string,
    changes: CategoryChanges
): CategoryRecord[] {

    assertValidCategoryCatalog(records);

    const current = records.find(
        category => category.id === id
    );

    if (!current) {

        throw new DomainError(
            "CATEGORY_NOT_FOUND"
        );
    }

    const next = records.map(category => {

        if (category.id !== id) {
            return { ...category };
        }

        return {

            id: current.id,

            kind: current.kind,

            name: changes.name.trim(),

            parentId: changes.parentId,

            archived: changes.archived,
        };
    });

    assertValidCategoryCatalog(next);

    return next;
}

export type CategoryCatalog =
    ReturnType<typeof createCategoryCatalog>;

export function isCategoryIdForKind(
    value: unknown,
    kind: CategoryKind
): value is string {

    if (!isCategoryId(value)) {
        return false;
    }

    const builtinKind = builtinKinds.get(value);

    return (
        builtinKind === undefined ||
        builtinKind === kind
    );
}

export function assertCategoryReference(
    catalog: CategoryCatalog,
    categoryId: string | undefined,
    kind: CategoryKind,
    allowArchived = false
): void {

    if (categoryId === undefined) {
        return;
    }

    if (allowArchived) {

        catalog.get(
            categoryId,
            kind
        );

    } else {

        catalog.requireAssignable(
            categoryId,
            kind
        );
    }
}