import { lazy, Suspense } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { ThemeProvider } from "./components/ThemeProvider";
import { ServerStatusBanner } from "./components/ServerStatusBanner";

const Playground = lazy(() =>
  import("./pages/Playground").then((module) => ({
    default: module.Playground,
  })),
);
const SessionLibrary = lazy(() =>
  import("./pages/SessionLibrary").then((module) => ({
    default: module.SessionLibrary,
  })),
);

const loading = <div className="page-loader">Loading CodeBro…</div>;
const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <Suspense fallback={loading}>
        <SessionLibrary />
      </Suspense>
    ),
  },
  {
    path: "/sessions/:sessionId",
    element: (
      <Suspense fallback={loading}>
        <Playground />
      </Suspense>
    ),
  },
]);

export function App() {
  return (
    <ThemeProvider>
      <ServerStatusBanner />
      <RouterProvider router={router} />
    </ThemeProvider>
  );
}
