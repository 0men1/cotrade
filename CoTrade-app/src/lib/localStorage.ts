export class LocalStorage {
    static setItem(key: string, value: any) {
        try {
            const jsonVal = JSON.stringify(value);
            localStorage.setItem(key, jsonVal);
        } catch (error) {
            console.error("error: failed to saved to localStorage, ", error)
        }
    }

    static getItem<T>(key: string): T | null {
        try {
            const value = localStorage.getItem(key);
            return value ? JSON.parse(value) : null;
        } catch (error) {
            console.error("error: failed to get item from localStorage, ", error)
            return null;
        }
    }

    removeItem(key: string) {
        try {
            localStorage.removeItem(key);
        } catch (error) {
            console.error("error: failed to remove item from localStorage, ", error)
        }
    }

    clear() {
        try {
            localStorage.clear();
        } catch (error) {
            console.error("error: failed to clear localStorage, ", error)
        }
    }
}