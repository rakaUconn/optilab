import { useEffect, useState } from "react";
import { waitForEngine } from "./api/client";
import { Inspector } from "./components/Inspector";
import { Library } from "./components/Library";
import { Layout3D } from "./components/Layout3D";
import { Plots } from "./components/Plots";
import { SurfaceTable } from "./components/SurfaceTable";
import { Toolbar } from "./components/Toolbar";
import { useStore } from "./store";

export default function App() {
  const trace = useStore((s) => s.trace);
  const [engine, setEngine] = useState<"starting" | "ready" | string>("starting");

  useEffect(() => {
    waitForEngine()
      .then(() => {
        setEngine("ready");
        void trace();
      })
      .catch((e) => setEngine(String(e)));
  }, [trace]);

  return (
    <div className="grid h-full grid-rows-[44px_minmax(0,1fr)_320px]">
      <Toolbar engine={engine} />
      <div className="grid min-h-0 grid-cols-[480px_minmax(0,1fr)_280px]">
        <SurfaceTable />
        <Layout3D />
        <Inspector />
      </div>
      <Plots />
      <Library />
    </div>
  );
}
