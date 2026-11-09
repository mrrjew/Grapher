import "server-only";
import { reportSections, reportVideo } from "@/content/report-guide";
import "./report-guide.css";

/** Render only after the parent page has checked the semester pass on the server. */
export function ReportGuide() {
  return (
    <section className="report-guide" aria-labelledby="report-guide-title">
      <p className="section-label">Writing your own report</p>
      <h2 id="report-guide-title">Report guide</h2>
      <p className="report-intro">
        Use these notes to check your work. Follow your department’s
        instructions first. The examples are short teaching fragments, not a
        report to submit.
      </p>
      <div className="report-sections">
        {reportSections.map((section) => (
          <details key={section.id}>
            <summary>{section.title}</summary>
            <div className="report-section-content">
              <h3>What goes in it</h3>
              <p>{section.guidance}</p>
              <h3>Good example</h3>
              <blockquote>{section.goodExample}</blockquote>
              <h3>Bad example</h3>
              <blockquote>{section.badExample}</blockquote>
            </div>
          </details>
        ))}
      </div>
      {reportVideo.url === null && (
        <section
          className="report-video-slot"
          aria-labelledby="report-video-title"
        >
          <h3 id="report-video-title">Video walkthrough</h3>
          <p>
            The video link has not been added yet. You can use all of the
            written guidance above.
          </p>
        </section>
      )}
    </section>
  );
}

export default ReportGuide;
