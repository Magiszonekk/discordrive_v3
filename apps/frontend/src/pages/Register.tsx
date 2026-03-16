import { useState } from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"
import { useAuth } from "@/hooks/useAuth"
import * as api from "@/api/queries"
import { initMasterKey } from "@/crypto"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"

export function Register() {
  const { login } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const token = await api.register(email, password)
      login(token)
      await initMasterKey()
      toast.success("Konto utworzone")
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>DiscorDrive</CardTitle>
          <CardDescription>Utwórz nowe konto</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input type="password" placeholder="Hasło" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Rejestracja..." : "Zarejestruj"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Masz już konto?{" "}
            <Link to="/login" className="text-primary hover:underline">Zaloguj się</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
