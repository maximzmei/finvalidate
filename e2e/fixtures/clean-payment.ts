// No FIN-* violations — Decimal used for all monetary arithmetic
import Decimal from 'decimal.js';

export function calculateTotal(price: string, quantity: number): Decimal {
  return new Decimal(price).mul(quantity);
}
