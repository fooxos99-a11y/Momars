import openpyxl

file_path = r"C:\Users\RAIQ\Desktop\القياس القبلي لدورة مدخل في التربية وخصائص النمو.xlsx"

try:
    wb = openpyxl.load_workbook(file_path)
    ws = wb.active

    print("Sheet name:", ws.title)
    print("\nFirst 15 rows:\n")

    for i, row in enumerate(ws.iter_rows(min_row=1, max_row=15, values_only=True), 1):
        print(f"Row {i}: {row}")
        
except Exception as e:
    print(f"Error: {e}")
