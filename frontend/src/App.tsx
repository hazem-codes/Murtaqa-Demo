import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Screen, UserMode } from "./lib/data";
import { useHandoffSeq } from "./lib/chatHandoff";
import { AppShell } from "./components/layout/AppShell";
import { Landing } from "./screens/Landing";
import { Login } from "./screens/Login";
import { Dashboard } from "./screens/Dashboard";
import { BusinessDashboard } from "./screens/BusinessDashboard";
import { Analysis } from "./screens/Analysis";
import { Eligibility } from "./screens/Eligibility";
import { BusinessEligibility } from "./screens/BusinessEligibility";
import { WhatIfSimulator } from "./screens/WhatIfSimulator";
import { SavingsAdvisor } from "./screens/SavingsAdvisor";
import { Chat } from "./screens/Chat";
import { Profile } from "./screens/Profile";

export default function App() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [mode, setMode] = useState<UserMode>("individuals");

  const navigate = (s: Screen) => {
    setScreen(s);
    window.scrollTo({ top: 0 });
  };

  // "Ask the Advisor" handoff (Part 7): any screen can stage a draft question via
  // askAdvisor(draft); this navigates to Chat whenever a new draft is staged.
  const handoffSeq = useHandoffSeq();
  useEffect(() => {
    if (handoffSeq > 0) navigate("chat");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoffSeq]);

  if (screen === "landing")
    return <Landing onNavigate={navigate} onSelectMode={setMode} />;
  if (screen === "login")
    return <Login onNavigate={navigate} mode={mode} onSelectMode={setMode} />;

  const isBusiness = mode === "business";

  return (
    <AppShell currentScreen={screen} onNavigate={navigate} mode={mode} onSelectMode={setMode}>
      <AnimatePresence mode="wait">
        <motion.div
          key={`${screen}-${mode}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3 }}
        >
          {screen === "dashboard" &&
            (isBusiness ? (
              <BusinessDashboard onNavigate={navigate} onSelectMode={setMode} />
            ) : (
              <Dashboard onNavigate={navigate} />
            ))}
          {screen === "analysis" && <Analysis mode={mode} />}
          {screen === "eligibility" && (isBusiness ? <BusinessEligibility /> : <Eligibility />)}
          {screen === "simulator" && !isBusiness && <WhatIfSimulator />}
          {screen === "savings" && <SavingsAdvisor />}
          {screen === "chat" && <Chat mode={mode} />}
          {screen === "profile" && <Profile onNavigate={navigate} mode={mode} />}
        </motion.div>
      </AnimatePresence>
    </AppShell>
  );
}
