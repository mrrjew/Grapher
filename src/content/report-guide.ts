import "server-only";

export type ReportSection = {
  id: string;
  title: string;
  guidance: string;
  goodExample: string;
  badExample: string;
};

// Teaching notes only. These fragments are not a completed lab report.
export const reportSections: readonly ReportSection[] = [
  {
    id: "title-and-aim",
    title: "Title and aim",
    guidance:
      "Name the relationship or quantity you investigated. State a specific aim that your measurements can answer. Keep it to one or two sentences.",
    goodExample:
      "Title: Extension of a spring under load. Aim: investigate how extension changes with applied force.",
    badExample:
      "Title: Physics practical. Aim: learn about springs and get good results.",
  },
  {
    id: "apparatus",
    title: "Apparatus",
    guidance:
      "List the equipment you actually used. Include instrument ranges or resolutions where they matter. Add a labelled diagram if it helps someone understand the arrangement.",
    goodExample:
      "Metre rule with 1 mm divisions, retort stand and clamp, spring, mass hanger and slotted masses.",
    badExample: "A ruler and some other equipment.",
  },
  {
    id: "method",
    title: "Method",
    guidance:
      "Describe what you did in a clear order. Identify what you changed, what you measured and what you kept constant. Explain repeats and precautions so another student could reproduce the procedure.",
    goodExample:
      "At each applied force, the extension was measured three times after the spring stopped moving. The same spring and reference mark were used throughout.",
    badExample: "We followed the instructions and wrote down the readings.",
  },
  {
    id: "results",
    title: "Results: tables and graphs",
    guidance:
      "Present your own measurements in labelled tables with units in the headings. Use a clear graph title, labelled axes and sensible scales. Show processing that connects raw readings to plotted quantities. Follow your course instructions for uncertainties and fitted lines.",
    goodExample:
      "Table heading: Force / N. Figure caption: Extension against applied force; crosses show the measured values.",
    badExample: "A table headed x and y, followed by an unlabelled graph.",
  },
  {
    id: "error-analysis",
    title: "Error analysis",
    guidance:
      "Identify relevant measurement uncertainties and explain how they affect your results. Distinguish random variation from a possible systematic offset. Use evidence from instrument resolution, repeated readings or the experimental setup. Do not invent an uncertainty or blame every difference on human error.",
    goodExample:
      "The pointer moved between readings, producing a spread in repeated measurements. A zero offset would shift all extension readings in the same direction.",
    badExample: "The result was wrong because of human error.",
  },
  {
    id: "discussion",
    title: "Discussion",
    guidance:
      "Explain what your results mean in relation to the aim and the relevant physics. Refer to features of your own graph, including departures from a pattern. Compare with an expected value only when appropriate, and consider uncertainty when judging agreement. Suggest a specific improvement linked to a limitation.",
    goodExample:
      "The higher-force points depart from the lower-force trend. This may indicate a change in the spring’s response, but the spread of repeated measurements should be checked before drawing that conclusion.",
    badExample: "The graph looks good, so the theory is definitely correct.",
  },
  {
    id: "conclusion",
    title: "Conclusion",
    guidance:
      "Answer the aim using the evidence you presented. State a measured quantity with its unit and justified uncertainty when relevant. Keep the claim within the range you tested. Do not introduce new readings or new arguments.",
    goodExample:
      "The measurements support an approximately linear force–extension relationship over the tested range.",
    badExample: "The experiment was successful and everything was perfect.",
  },
  {
    id: "references",
    title: "References",
    guidance:
      "Credit the sources you used for theory, methods or comparison values. Follow the citation style required by your department. Give enough detail for another reader to find the source. Record a page or section where appropriate.",
    goodExample:
      "Book reference structure: Author, book title, edition, publisher, year, relevant page. Replace each part with details from the source you actually used.",
    badExample: "Google and a physics textbook.",
  },
];

// The owner will supply a video link later. Do not embed an unreviewed URL.
export const reportVideo: { url: null } = { url: null };
