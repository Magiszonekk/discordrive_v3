import { Routes, Route, Navigate } from "react-router-dom"
import { useAuth } from "./hooks/useAuth"
import { Login } from "./pages/Login"
import { Register } from "./pages/Register"
import { Files } from "./pages/Files"
import { Share } from "./pages/Share"

export function App() {
  const { token } = useAuth()

  return (
    <Routes>
      <Route path="/login" element={token ? <Navigate to="/" /> : <Login />} />
      <Route path="/register" element={token ? <Navigate to="/" /> : <Register />} />
      <Route path="/" element={token ? <Files /> : <Navigate to="/login" />} />
      <Route path="/share/:shareToken" element={<Share />} />
    </Routes>
  )
}
