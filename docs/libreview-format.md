# 📝 LibreView Data Format

This document explains how to export your glucose data from LibreView and what format Glukoscillator expects.

---

## What is LibreView?

[LibreView](https://www.libreview.com/) is Abbott's cloud platform for storing and analyzing data from FreeStyle Libre continuous glucose monitors (CGM).

**Supported devices:**
- FreeStyle Libre 1
- FreeStyle Libre 2
- FreeStyle Libre 3

---

## Exporting Your Data

### Step-by-Step

1. **Log in** to [LibreView](https://www.libreview.com/) with your account
2. Navigate to **Reports** in the main menu
3. Look for **Export Data** or **Download** option
4. Select **CSV format** 
5. Choose your date range (or export all data)
6. Click **Download** to save the CSV file
7. **Drag and drop** the CSV file onto Glukoscillator's drop zone

### Alternative: Using LibreLinkUp

If you use the LibreLinkUp mobile app, you may need to access LibreView through a web browser to export CSV files.

---

## Expected CSV Format

Glukoscillator's parser looks for these columns:

### Required Columns

| Column Name | Description | Example |
|-------------|-------------|---------|
| `Device Timestamp` | Date and time of reading | `15-01-2024 14:30` |
| `Historic Glucose mg/dL` | Glucose value (mg/dL) | `125` |

### Alternative Column Names

The parser also recognizes:
- `Historic Glucose mmol/L` — For non-US units
- `Record Type` — 0 = automatic, 1 = manual scan

### Example CSV Structure

```csv
Device,Serial Number,Device Timestamp,Record Type,Historic Glucose mg/dL
FreeStyle Libre 3,ABC12345,15-01-2024 08:00,0,95
FreeStyle Libre 3,ABC12345,15-01-2024 08:15,0,102
FreeStyle Libre 3,ABC12345,15-01-2024 08:30,0,118
...
```

---

## Supported Date Formats

The parser handles multiple date formats:

| Format | Example | Region |
|--------|---------|--------|
| DD-MM-YYYY HH:MM | `15-01-2024 14:30` | Europe |
| DD/MM/YYYY HH:MM | `15/01/2024 14:30` | Europe |
| MM-DD-YYYY HH:MM | `01-15-2024 14:30` | US |
| YYYY-MM-DD HH:MM | `2024-01-15 14:30` | ISO |
| YYYY-MM-DDTHH:MM:SS | `2024-01-15T14:30:00` | ISO 8601 |

---

## Unit Handling

### Automatic Detection

The parser automatically detects glucose units based on column headers:

| Column Header | Unit | Conversion |
|---------------|------|------------|
| `Historic Glucose mg/dL` | mg/dL | No conversion |
| `Historic Glucose mmol/L` | mmol/L | Multiplied by 18 to convert to mg/dL |

### Why mg/dL?

All internal calculations use mg/dL for consistency. The standard time-in-range boundaries (70-180) are defined in mg/dL.

If your data is in mmol/L:
- 3.9 mmol/L = 70 mg/dL (low boundary)
- 10.0 mmol/L = 180 mg/dL (high boundary)

---

## Troubleshooting

### "No glucose data found"

**Possible causes:**
- CSV file doesn't contain expected column headers
- File is empty or corrupted
- Wrong file type (not CSV)

**Solutions:**
1. Check that you exported from LibreView (not another app)
2. Open the CSV in a text editor to verify it has data
3. Ensure column headers match expected format

### "No days with valid data"

**Possible causes:**
- Date parsing failed
- All readings were filtered out

**Solutions:**
1. Check that timestamps are in a supported format
2. Ensure there are actual glucose readings (not just metadata rows)

### Only Some Days Appear

**Possible causes:**
- Days with fewer than ~10 readings are filtered out
- Some days may have only scan readings (Record Type = 1)

**Solutions:**
- This is normal — days need sufficient data to create meaningful waveforms
- Try exporting a longer date range

---

## Sample Data

Glukoscillator includes sample glucose data for testing:

```
public/sample-data/sample-glucose.csv
```

This file loads automatically when you first open the app, so you can explore the synthesizer without uploading your own data.

---

## Privacy Note

**Your data stays local.** Glukoscillator processes CSV files entirely in your browser. No glucose data is uploaded to any server.

---

← [Input Controls](input-controls.md) | [Back to README](../README.md)

