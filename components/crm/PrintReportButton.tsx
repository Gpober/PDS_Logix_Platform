'use client';

// "Download PDF" for a saved report. Uses the browser's print-to-PDF (Save as
// PDF in the print dialog), so charts stay vector-sharp and text stays
// selectable. The print stylesheet in globals.css isolates #report-print-area
// and flips the dark UI to an ink-on-white document for paper.
export function PrintReportButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-full border border-line px-3 py-1.5 text-xs text-stone hover:border-tulip hover:text-tulip"
      title="Save the report as a PDF (choose “Save as PDF” in the print dialog)"
    >
      Download PDF
    </button>
  );
}
