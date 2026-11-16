// PrintButton.jsx: a "Print or save as PDF" button for any dashboard.
// Needs print.css imported once (in main.jsx) so the printout looks right.
//
// Use it:  <PrintButton fileName="Corner Coffee - October report" />
// fileName becomes the suggested name when the client picks "Save as PDF".

export default function PrintButton({ fileName, label = "Print or save as PDF" }) {
  function handlePrint() {
    // The browser names the PDF after the page title, so swap it in for a moment.
    const oldTitle = document.title;
    if (fileName) document.title = fileName;

    // Put the old title back once the print window closes.
    window.addEventListener("afterprint", () => (document.title = oldTitle), { once: true });

    window.print();
  }

  return (
    <button type="button" className="print-button no-print" onClick={handlePrint}>
      {label}
    </button>
  );
}
