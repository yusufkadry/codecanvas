import { useEffect } from "react";
import { useStore } from "./lib/store";
import { Landing } from "./components/Landing";
import { Workspace } from "./components/Workspace";
import { SettingsModal } from "./components/SettingsModal";
import { PushModal } from "./components/PushModal";
import { ProjectsDrawer } from "./components/ProjectsDrawer";

export default function App() {
  const phase = useStore((s) => s.phase);
  const onLanding = phase === "landing";

  useEffect(() => {
    void useStore.getState().initApp();
  }, []);

  return (
    <div className={`app ${onLanding ? "app-light" : "app-dark"}`}>
      {onLanding ? <Landing /> : <Workspace />}
      <SettingsModal />
      <PushModal />
      <ProjectsDrawer />
    </div>
  );
}
