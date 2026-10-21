export declare class MonotonicBudget {
    private remainingValue;
    constructor(limit: number);
    get remaining(): number;
    consume(amount?: number): boolean;
}
