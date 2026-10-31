import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("billing", "0001_initial"),
        ("catalog", "0004_discountrule_discountruleproduct_and_more"),
    ]

    operations = [
        migrations.RenameField(
            model_name="discountredemption",
            old_name="invoice_id",
            new_name="invoice",
        ),
        migrations.AlterField(
            model_name="discountredemption",
            name="invoice",
            field=models.ForeignKey(
                db_column="invoice_id",
                on_delete=django.db.models.deletion.PROTECT,
                related_name="discount_redemptions",
                to="billing.invoice",
            ),
        ),
    ]
