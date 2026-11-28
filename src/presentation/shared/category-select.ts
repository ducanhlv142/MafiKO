import type {
    CategoryCatalog,
    CategoryKind,
} from "../../domain/finance/category-catalog";

interface CategorySelectOptions {

    selectedId?: string;

    includeUncategorized?: boolean;

    keepArchivedIds?: readonly string[];
}

export function populateCategorySelect(
    select: HTMLSelectElement,
    catalog: CategoryCatalog,
    kind: CategoryKind,
    options: CategorySelectOptions = {}
): void {

    const selectedId =
        options.selectedId ?? select.value;

    const keepArchived = new Set(
        options.keepArchivedIds ?? []
    );

    const records = catalog.list(
        kind,
        true
    ).filter(category =>

        !category.archived ||

        keepArchived.has(category.id)
    );

    select.replaceChildren();

    if (options.includeUncategorized) {

        select.add(
            new Option(
                "Chưa phân loại",
                ""
            )
        );
    }

    for (const category of records) {

        const label = category.archived

            ? `${category.name} (Đã lưu trữ)`

            : category.name;

        select.add(
            new Option(
                label,
                category.id
            )
        );
    }

    if (
        Array.from(select.options).some(
            option => option.value === selectedId
        )
    ) {
        select.value = selectedId;
    }
}