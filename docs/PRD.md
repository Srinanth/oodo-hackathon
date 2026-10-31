# Subscription Management System - Product Requirements

**Status:** Draft for hackathon implementation
**Source:** `docs/Subscription_Management_System.pdf`
**Project team:** Srinanth, Angelo, Deepak

## 1. Product overview

Brightloop Software needs one system to manage subscription products and plans, customer subscriptions, recurring invoices, payment records, and revenue visibility. Today these tasks are split across spreadsheets and manual work, causing missed renewals, incorrect invoices, and poor visibility into recurring revenue.

The product will provide a staff workspace for setup and operations and a customer portal for customers to view and manage only their own subscriptions and invoices.

## 2. Goals and success criteria

- An administrator can configure products, plans, taxes, discounts, and staff access.
- Staff can prepare a quote from a reusable quotation template and convert it into a trackable subscription.
- The system generates each due invoice once, with customer, lines, taxes, discounts, and totals filled in.
- Staff can record payments against invoices and see outstanding and overdue balances.
- Finance can review active subscriptions, revenue, payments, and overdue invoices with filters and a summary.
- Customer and staff access is restricted by role; customers can access only their own records.
- The reporting experience should respond in under two seconds with thousands of subscriptions, as specified by the brief.

## 3. Users and permissions

| User | Needs | Access |
|---|---|---|
| Administrator | Configure the business and manage access | Full system access; only role allowed to create staff accounts |
| Internal staff | Handle customer, quote, subscription, invoice, and payment operations | Day-to-day operational access, limited compared with administrator |
| Customer | See and manage their own subscriptions and invoices | Customer portal scoped to the authenticated customer's records |
| Finance lead | Understand recurring revenue and collections | Reporting and read access to relevant financial records; may also be staff |

### Authentication requirements

- Each email address belongs to at most one account.
- Passwords must be more than eight characters and contain an uppercase letter, a lowercase letter, and a special character.
- A password reset link is sent to the registered email address.
- Staff accounts are created by an administrator. Customer self-registration is supported.

## 4. Functional requirements

### P0 - Core selection-round flow

1. **Product catalog and variants**
   - Admin creates products with name, type, sales price, cost price, notes, and optional variants.
   - Variant pricing supports configurable price adjustments. For example, selecting the Odoo brand adds 560 to the price; this is a configurable variant rule, not a hard-coded special case.

2. **Plans**
   - Admin creates plans with price, billing interval (daily, weekly, monthly, yearly), minimum quantity, and availability dates.
   - A plan can be configured to close automatically at its end date, or to allow early closure, pause, or renewal.

3. **Quotation templates and quotes**
   - Staff can create and reuse quotation templates containing plan/product lines.
   - A quote has an expiry/validity period and can be converted to a subscription.
   - Quote/subscription details include a unique number, customer, plan, start and expiry dates, payment terms, product lines, quantities, unit prices, taxes, and line/total amounts.
   - The lifecycle is Draft -> Quotation -> Confirmed -> Active -> Closed, with the current state visible to staff.

4. **Subscriptions and customer portal**
   - Staff can view and manage subscriptions; customers can see and manage only their own subscriptions and invoices.
   - Supported lifecycle actions include confirm, activate, pause, renew, close early, and close at plan end, subject to plan configuration and valid state transitions.

5. **Recurring invoicing**
   - On each billing date, create an invoice from the subscription with the correct customer, products, quantities, taxes, discounts, and totals.
   - Tax rules are configurable by an administrator and applied automatically.
   - Invoice states are Draft -> Confirmed -> Paid. Staff can confirm, cancel, send, or print an invoice.
   - Billing must be idempotent: retrying a billing run must not create a duplicate invoice or skip a due subscription.

6. **Discount rules**
   - Only an administrator creates rules for a fixed amount or percentage discount.
   - Rules may specify minimum purchase/quantity, start and end dates, maximum uses, and applicability to selected products or the whole subscription.
   - Eligible discounts appear as a separate line on the next invoice and stop applying when expired or exhausted.

7. **Payment tracking**
   - Staff records a payment against an invoice with method, amount, date, and note.
   - Invoice balances and paid/outstanding/overdue status update from recorded payments.
   - Staff can identify overdue invoices for follow-up.

8. **Finance dashboard and reports**
   - Show active subscription count, revenue, payments received, outstanding balance, and overdue invoices.
   - Provide a summary view and filters (at minimum date range and status; customer/product filters are recommended).
   - Support thousands of subscriptions while keeping report pages under two seconds, per the brief.

### P1 - Useful extensions if time permits

- Partial payments and multiple payment records per invoice.
- Invoice PDF generation and configurable email templates.
- Audit trail for changes to discounts, subscription state, and invoice actions.
- Customer-facing cancellation/pause requests requiring staff approval.

## 5. Key workflows

### Quote to active subscription

Staff selects a customer and quote template, adjusts lines and dates, reviews taxes and totals, sends the quotation, then confirms it. Confirmation creates or activates the associated subscription with a traceable lifecycle state.

### Monthly billing run

The billing process finds subscriptions due at the run date, locks or otherwise safely claims each due period, calculates invoice lines and applicable tax/discount rules, and writes one invoice per subscription per period. Repeating the same run is safe. Staff then confirms and sends invoices; payment records move invoices toward Paid.

### Payment and collections

Staff records the amount received and its method/date/note against the correct invoice. The system recalculates the remaining balance and highlights overdue unpaid balances for the finance team.

## 6. Non-functional requirements

- **Authorization:** Enforce role checks on the server for every protected action and customer ownership checks for portal records.
- **Data integrity:** Use database transactions and uniqueness constraints for account email, business numbers, and invoice-per-subscription-period.
- **Financial accuracy:** Store currency amounts as fixed-precision decimals, not floating point; keep the currency explicit on money-bearing records.
- **Reliability:** Billing retries must be safe and observable; record run outcomes and failures for staff.
- **Performance:** Reports should meet the stated two-second target at thousands of subscriptions; add indexes for common date, state, customer, and due-date filters.
- **Security:** Hash passwords with a modern password-hashing function, expire reset tokens, and avoid exposing other customers' identifiers or records.
- **Usability:** Show state, next billing date, outstanding balance, and validation errors clearly in staff workflows.

## 7. Scope assumptions and open decisions

- The brief requires recording payments but does not require payment gateway integration. The MVP uses manual payment recording; a gateway is a later integration.
- "Revenue" needs a team decision before implementation: recommended dashboard definition is cash collected in the selected period, with invoiced and outstanding amounts shown separately.
- Taxes are configured as simple percentage rules for the MVP unless the team has a required jurisdiction-specific rule set.
- Invoice sending and password-reset delivery require an email provider. For a demo, a development mail catcher or clearly labeled simulated send can be used if live email credentials are unavailable.
- The brief does not specify stack, currency, timezone, proration, refunds, accounting exports, or multi-company support. Keep the MVP single-company and make currency/timezone explicit in configuration.
- Password wording says "more than eight characters"; implement minimum length 9.

## 8. MVP acceptance checklist

- An admin creates a product, a variant with a price adjustment, a taxed plan, a discount rule, and a staff account.
- Staff creates a quote from a template and moves it through the quote/confirmation flow into an active subscription.
- A customer logs into the portal and cannot access another customer's subscription or invoice.
- Running billing for a due subscription creates a correctly calculated invoice; running it again creates no duplicate.
- Staff records a payment and sees the invoice balance/status change; unpaid overdue invoices are identifiable.
- The finance dashboard shows active subscriptions, collected revenue, outstanding amounts, and overdue invoices with filters.

## 9. Delivery priorities

Build one complete demo path first: configure catalog and plan -> create customer and quote -> activate subscription -> generate invoice -> record payment -> review finance dashboard. Each owner should deliver their domain behind agreed interfaces, with early integration on shared identifiers and state definitions.
