"""Re-do the V5 edit using Excel COM (win32com) so the file is byte-clean.

openpyxl drops xl/metadata.xml, calcChain, customXml and the sensitivity
label, which is why Excel showed a "Repaired Records" dialog on the first
V5. Driving Excel directly preserves all of that.

Allocation source of truth: ../allocation-research.md
"""

from pathlib import Path
import shutil
import win32com.client as win32

SRC = Path(
    r"C:\Users\buyss\Downloads\BOOKED  CREATIVE REC_V4 Loop x Pleasing OOH Media Plan 21.05.26.xlsx"
)
OUT_REPO = Path(__file__).parent / "BOOKED_CREATIVE_REC_V5_FINAL_21.05.26.xlsx"
OUT_DOWNLOADS = Path(r"C:\Users\buyss\Downloads\BOOKED_CREATIVE_REC_V5_FINAL_21.05.26.xlsx")

# Frame ID -> A | B. 39 entries, 20 A / 19 B. Mirrors _update_xlsx.py.
ALLOCATION: dict[str, str] = {
    # ---- A (20) ----
    "1234595301": "A", "1234577772": "A", "1234600974": "A", "1234572013": "A",
    "1234599721": "A", "1234600067": "A", "1234568346": "A", "1234589177": "A",
    "1234600409": "A", "1234601019": "A", "1234583810": "A", "1234574586": "A",
    "1234599926": "A", "1234588637": "A", "1234602575": "A", "1234598633": "A",
    "1234568933": "A", "1234602248": "A", "1234602140": "A", "1234587817": "A",
    # ---- B (19) ----
    "1234568488": "B", "1234569067": "B", "2000202916": "B", "1234572113": "B",
    "1234597806": "B", "1234575760": "B", "1234602396": "B", "1234568710": "B",
    "1234590601": "B", "1234568811": "B", "1234588929": "B", "1234574394": "B",
    "1234599324": "B", "1234585617": "B", "1234577756": "B", "1234571996": "B",
    "1234602085": "B", "1234598745": "B", "1234602067": "B",
}

assert len(ALLOCATION) == 39
counts = {"A": 0, "B": 0}
for v in ALLOCATION.values():
    counts[v] += 1
assert counts == {"A": 20, "B": 19}
print(f"Allocation sanity: {counts}")

XL_OPEN_XML_WORKBOOK = 51  # FileFormat for .xlsx


def main() -> None:
    # Remove the bad V5 from earlier openpyxl run so we don't confuse Excel.
    for p in (OUT_REPO, OUT_DOWNLOADS):
        if p.exists():
            print(f"Removing stale {p}")
            p.unlink()

    print("Launching Excel (hidden)")
    xl = win32.Dispatch("Excel.Application")
    xl.Visible = False
    xl.DisplayAlerts = False
    xl.ScreenUpdating = False
    try:
        # UpdateLinks=0 prevents Excel from trying to refresh the SharePoint
        # externalLink on open.
        print(f"Opening {SRC}")
        wb = xl.Workbooks.Open(str(SRC), UpdateLinks=0, ReadOnly=False)
        try:
            ws = wb.Worksheets("RECOMMENDED CREATIVE PLACEMENT")
            print(f"Sheet UsedRange.Rows.Count = {ws.UsedRange.Rows.Count}")

            updated = 0
            changed = []
            # Data rows 2..40, frame ID in col 5 (E), creative in col 1 (A).
            last_row = ws.UsedRange.Rows.Count
            for row in range(2, last_row + 1):
                frame_val = ws.Cells(row, 5).Value
                if frame_val is None:
                    continue
                # Frame ID may be int or float coming back from COM.
                if isinstance(frame_val, float):
                    frame_id = str(int(frame_val))
                else:
                    frame_id = str(frame_val).strip()
                if frame_id not in ALLOCATION:
                    print(f"  WARN row {row}: frame {frame_id} not in map")
                    continue
                new_val = ALLOCATION[frame_id]
                old_val = ws.Cells(row, 1).Value
                if old_val != new_val:
                    changed.append((row, frame_id, old_val, new_val))
                ws.Cells(row, 1).Value = new_val
                updated += 1

            print(f"Updated {updated} rows ({len(changed)} actually changed)")
            for r, fid, old, new in changed:
                print(f"  row {r}  frame {fid}  {old} -> {new}")

            # Update the side-panel summary by string match.
            for row in range(1, last_row + 1):
                cell = ws.Cells(row, 7)
                v = cell.Value
                if not isinstance(v, str):
                    continue
                if v.startswith("A (Wembley Creative)"):
                    cell.Value = "A (Wembley Creative): 20 placements (51.3%)"
                    print(f"  Updated G{row} -> {cell.Value}")
                elif v.startswith("B (General Creative)"):
                    cell.Value = "B (General Creative): 19 placements (48.7%)"
                    print(f"  Updated G{row} -> {cell.Value}")

            print(f"Saving as {OUT_REPO}")
            wb.SaveAs(str(OUT_REPO), FileFormat=XL_OPEN_XML_WORKBOOK)
        finally:
            wb.Close(SaveChanges=False)
    finally:
        xl.Quit()

    print(f"Copying to {OUT_DOWNLOADS}")
    shutil.copyfile(OUT_REPO, OUT_DOWNLOADS)
    print("Done.")


if __name__ == "__main__":
    main()
