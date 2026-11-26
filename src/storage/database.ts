const DATABASE_NAME = "mafiko";
const DATABASE_VERSION = 2;

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;

      if (event.oldVersion < 1) {
        db.createObjectStore("accounts", { keyPath: "id" });
      }

      if (event.oldVersion < 2) {
        const store = db.createObjectStore("transactions", { keyPath: "id" });
        store.createIndex("byAccount", "accountId");
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