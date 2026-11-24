How a plan change in the middle of a billing cycle is charged, as agreed in the Billing v2 design review.

> [!NOTE]
> These rules apply to monthly plans. Annual plans are still open (below).

## Upgrades

- Charge the difference for the days left in the cycle, **today**.
- The new limits apply at once.

## Downgrades

- Credit the unused days to the next invoice; never refund to the card.
- The old limits stay until the cycle ends.

## Examples

| Change | Day of cycle | Charged today | Credited |
| --- | --- | --- | --- |
| Starter → Team | 10 of 30 | $26.67 | n/a |
| Team → Starter | 20 of 30 | n/a | $13.33 |
| Team → Business | 1 of 30 | $96.67 | n/a |

```ts
const credit = (unusedDays / cycleDays) * oldPlan.price;
const charge = (unusedDays / cycleDays) * (newPlan.price - oldPlan.price);
```

## Open questions

- [ ] Annual plans: prorate by day or by month?
- [x] Taxes follow the line item, not the invoice
- [x] Show the proration on the invoice preview