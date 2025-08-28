import { BrowserRouter as Router, Routes, Route } from "react-router";
import SignIn from "./pages/AuthPages/SignIn";
import NotFound from "./pages/OtherPage/NotFound";
import AppLayout from "./layout/AppLayout";
import { ScrollToTop } from "./components/common/ScrollToTop";
import Home from "./pages/Dashboard/Home";
import Dexcom from "./pages/Dashboard/Dexcom";
import Calendar from "./pages/Calendar";
import { GlucoseProvider } from "./context/GlucoseContext";
import { DexcomProvider } from "./context/DexcomContext";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/auth/ProtectedRoute";

export default function App() {
  return (
    <AuthProvider>
      <GlucoseProvider>
        <DexcomProvider>
          <Router>
          <ScrollToTop />
          <Routes>
            {/* Protected Dashboard Layout */}
            <Route element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }>
              <Route index path="/" element={<Home />} />
              <Route path="/dexcom" element={<Dexcom />} />
              <Route path="/calendar" element={<Calendar />} />
            </Route>

            {/* Public Auth Routes */}
            <Route path="/signin" element={<SignIn />} />

            {/* Fallback Route */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Router>
        </DexcomProvider>
      </GlucoseProvider>
    </AuthProvider>
  );
}
