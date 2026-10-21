export class MonotonicBudget {
  private remainingValue: number

  constructor(limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 0) throw new Error('invalid budget')
    this.remainingValue = limit
  }

  get remaining(): number {
    return this.remainingValue
  }

  consume(amount = 1): boolean {
    if (!Number.isSafeInteger(amount) || amount <= 0) return false
    if (amount > this.remainingValue) return false
    this.remainingValue -= amount
    return true
  }
}
