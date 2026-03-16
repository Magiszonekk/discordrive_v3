import { useSyncExternalStore, useCallback } from "react"
import { getToken, setToken, clearToken } from "@/api/graphql"

const listeners = new Set<() => void>()

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function notify() {
  listeners.forEach((cb) => cb())
}

export function useAuth() {
  const token = useSyncExternalStore(subscribe, getToken)

  const login = useCallback((newToken: string) => {
    setToken(newToken)
    notify()
  }, [])

  const logout = useCallback(() => {
    clearToken()
    localStorage.removeItem("dd_master_key")
    notify()
  }, [])

  return { token, isLoggedIn: !!token, login, logout }
}
