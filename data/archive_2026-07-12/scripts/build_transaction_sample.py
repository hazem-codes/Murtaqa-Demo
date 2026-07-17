from pathlib import Path

import pandas as pd

ROOT_DIR = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT_DIR / "data" / "raw"

df = pd.read_csv(RAW_DIR / "transactions.csv")

unique_accounts = df['accountNumber'].unique()[:500]  # أخذ أول 400 حساب فريد

sample_df = df[df['accountNumber'].isin(unique_accounts)]

sample_df.to_csv(RAW_DIR / "transactions_sample.csv", index=False)
print("تم! عدد الصفوف الناتجة:", len(sample_df))