import { createRoot } from "react-dom/client";
import { GraphHelper } from "@/components/graph-helper";
import { AuthForm } from "@/components/auth-form";
import "@/app/globals.css";

createRoot(document.getElementById("root")!).render(
  <main id="main" className="workspace">
    <div className="workspace-heading">
      <div>
        <p className="section-label">Physics Graph Helper</p>
        <h1>Your workspace</h1>
      </div>
      <AuthForm mode="logout" draftUserId="test-student" />
    </div>
    <GraphHelper userId="test-student" />
  </main>,
);
