// The "What happened" box: a few plain-English sentences about the numbers.
// It goes first on the dashboard, above the charts, because it is the part
// a busy owner actually reads.
//
// Use it:
//   <WhatHappened sentences={["Sales were $11,930 this week...", "..."]} note="Updated each morning." />
import { useId } from "react";

export default function WhatHappened({ sentences, title = "What happened", note }) {
  const titleId = useId();

  if (!sentences.length) return null;

  return (
    <section className="summary" aria-labelledby={titleId}>
      <h2 id={titleId} className="summary__title">
        {title}
      </h2>
      <ul className="summary__list">
        {sentences.map((sentence) => (
          <li key={sentence}>{sentence}</li>
        ))}
      </ul>
      {note && <p className="summary__note">{note}</p>}
    </section>
  );
}
