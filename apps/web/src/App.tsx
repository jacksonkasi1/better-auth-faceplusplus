import { Navigate, Route, Routes } from "react-router-dom";
import FaceSignIn from "@/pages/FaceSignIn";
import FaceSignUp from "@/pages/FaceSignUp";
import Dashboard from "@/pages/Dashboard";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/auth/face-sign-in" replace />} />
      <Route path="/auth/face-sign-in" element={<FaceSignIn />} />
      <Route path="/auth/face-sign-up" element={<FaceSignUp />} />
      <Route path="/dashboard" element={<Dashboard />} />
    </Routes>
  );
}
