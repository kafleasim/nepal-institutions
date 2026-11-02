import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { CountryProfilePage } from "./pages/CountryProfilePage";
import { CountrySpacePage } from "./pages/CountrySpacePage";
import { ResearchPage } from "./research/ResearchPage";
import { VdemPage } from "./vdem/VdemPage";

const router = createBrowserRouter([
  // Not linked from the shell on purpose: reachable only by URL.
  { path: "/research", element: <ResearchPage /> },
  { path: "/vdem", element: <VdemPage /> },
  {
    element: <AppShell />,
    children: [
      { path: "/", element: <Navigate to="/country/PAK" replace /> },
      { path: "/country", element: <CountryProfilePage /> },
      { path: "/country/:iso", element: <CountryProfilePage /> },
      { path: "/country-space", element: <CountrySpacePage /> },
      { path: "*", element: <Navigate to="/country/PAK" replace /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
