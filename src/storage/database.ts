import {
  createDefaultCategories,
} from "../domain/finance/category-catalog.js";

const DATABASE_NAME = "mafiko";
const DATABASE_VERSION = 7;

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(
      DATABASE_NAME,
      DATABASE_VERSION
    );

    request.onupgradeneeded = (event) => {
      const db = request.result;

      if (event.oldVersion < 1) {
        db.createObjectStore("accounts", {
          keyPath: "id"
        });
      }

      if (event.oldVersion < 2) {
        const store = db.createObjectStore(
          "transactions",
          { keyPath: "id" }
        );

        store.createIndex("byAccount", "accountId");
      }

      if (event.oldVersion < 3) {
        const store = db.createObjectStore(
          "transfers",
          { keyPath: "id" }
        );

        store.createIndex("bySource", "fromAccountId");
        store.createIndex("byDestination", "toAccountId");
      }

      if (event.oldVersion < 4) {
        const store = db.createObjectStore(
          "budgets",
          { keyPath: "id" }
        );

        store.createIndex(
          "byMonthCurrency",
          ["month", "currency"]
        );
      }

      if (event.oldVersion < 5) {
        const loans = db.createObjectStore(
          "loans",
          { keyPath: "id" }
        );

        loans.createIndex(
          "byAccount",
          "accountId"
        );

        loans.createIndex(
          "byDirection",
          "direction"
        );

        loans.createIndex(
          "byCurrency",
          "currency"
        );

        loans.createIndex(
          "byDueDate",
          "dueDate"
        );

        const payments = db.createObjectStore(
          "loanPayments",
          { keyPath: "id" }
        );

        payments.createIndex(
          "byLoan",
          "loanId"
        );

        payments.createIndex(
          "byAccount",
          "accountId"
        );

        payments.createIndex(
          "byDate",
          "date"
        );
      }
      if (event.oldVersion < 6) {
        const savings = db.createObjectStore(
          "savingsPlans",
          { keyPath: "id" }
        );

        savings.createIndex(
          "byAccount",
          "accountId"
        );

        savings.createIndex(
          "byCurrency",
          "currency"
        );

        savings.createIndex(
          "byKind",
          "kind"
        );

        savings.createIndex(
          "byMaturityDate",
          "maturityDate"
        );

        const movements = db.createObjectStore(
          "savingsMovements",
          { keyPath: "id" }
        );

        movements.createIndex(
          "bySavings",
          "savingsId"
        );

        movements.createIndex(
          "byAccount",
          "accountId"
        );

        movements.createIndex(
          "byDate",
          "date"
        );

        movements.createIndex(
          "byKind",
          "kind"
        );
      }
      if (event.oldVersion < 7) {

        const categoryStore = db.createObjectStore(
          "categories",
          {
            keyPath: "id",
          }
        );

        categoryStore.createIndex(
          "byKind",
          "kind"
        );

        categoryStore.createIndex(
          "byParent",
          "parentId"
        );

        for (const category of
          createDefaultCategories()) {

          categoryStore.add(category);
        }
      }
    };

    request.onsuccess = () => {
      const db = request.result;

      db.onversionchange = () => db.close();

      resolve(db);
    };

    request.onerror = () => reject(request.error);
  });
}