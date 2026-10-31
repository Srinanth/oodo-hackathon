from datetime import datetime

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.billing.services import execute_billing_run, parse_business_date


class Command(BaseCommand):
    help = "Execute recurring billing run for due subscriptions on a business date."

    def add_arguments(self, parser):
        parser.add_argument(
            "--business-date",
            type=str,
            default=None,
            help="Business date for the billing run (format: YYYY-MM-DD). Defaults to today.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Simulate the billing run without creating invoices or advancing subscription dates.",
        )

    def handle(self, *args, **options):
        business_date_str = options.get("business_date")
        dry_run = options.get("dry_run", False)

        if business_date_str:
            try:
                business_date = datetime.strptime(business_date_str.strip(), "%Y-%m-%d").date()
            except ValueError:
                raise CommandError(
                    f"Invalid date format '{business_date_str}'. Expected YYYY-MM-DD."
                )
        else:
            business_date = timezone.now().date()

        self.stdout.write(
            self.style.NOTICE(
                f"Starting billing run for business date: {business_date}"
                + (" (DRY RUN)" if dry_run else "")
            )
        )

        billing_run = execute_billing_run(
            business_date=business_date,
            triggered_by=None,
            dry_run=dry_run,
        )

        self.stdout.write(
            f"Run ID: {billing_run.id}\n"
            f"Status: {billing_run.status}\n"
            f"Subscriptions evaluated: {billing_run.subscriptions_seen}\n"
            f"Invoices created: {billing_run.invoices_created}\n"
            f"Failures: {billing_run.failures}"
        )

        # Print itemized results
        items = billing_run.items.all().order_by("created_at")
        if items.exists():
            self.stdout.write("\nItem breakdown:")
            for item in items:
                inv_text = f" -> Invoice {item.invoice.number}" if item.invoice else ""
                err_text = f" (Error: {item.error_message})" if item.error_message else ""
                self.stdout.write(
                    f" - Sub {item.subscription_id} [{item.period_start}]: {item.status}{inv_text}{err_text}"
                )

        if billing_run.failures > 0:
            self.stderr.write(
                self.style.WARNING(
                    f"\nBilling run completed with {billing_run.failures} failure(s)."
                )
            )
            if billing_run.error_summary:
                self.stderr.write(billing_run.error_summary)
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"\nBilling run completed successfully. Invoices created: {billing_run.invoices_created}."
                )
            )
