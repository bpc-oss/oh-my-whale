export class MonotonicBudget {
    remainingValue;
    constructor(limit) {
        if (!Number.isSafeInteger(limit) || limit < 0)
            throw new Error('invalid budget');
        this.remainingValue = limit;
    }
    get remaining() {
        return this.remainingValue;
    }
    consume(amount = 1) {
        if (!Number.isSafeInteger(amount) || amount <= 0)
            return false;
        if (amount > this.remainingValue)
            return false;
        this.remainingValue -= amount;
        return true;
    }
}
