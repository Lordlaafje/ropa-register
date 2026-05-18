import { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { getConfig } from '@/lib/config'

export default function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut, me } = useAuth()
  const appName = getConfig().appName

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-[1200px] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-3">
              <div className="w-7 h-7 rounded bg-emerald-600 flex items-center justify-center text-white text-xs font-semibold">R</div>
              <span className="font-semibold text-slate-900">{appName}</span>
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  isActive
                    ? 'text-slate-900 font-medium'
                    : 'text-slate-500 hover:text-slate-900'
                }
              >
                Register
              </NavLink>
              <NavLink
                to="/transfers"
                className={({ isActive }) =>
                  isActive
                    ? 'text-slate-900 font-medium'
                    : 'text-slate-500 hover:text-slate-900'
                }
              >
                Data transfers
              </NavLink>
              {me?.role === 'admin' && (
                <NavLink
                  to="/admin"
                  className={({ isActive }) =>
                    isActive
                      ? 'text-slate-900 font-medium'
                      : 'text-slate-500 hover:text-slate-900'
                  }
                >
                  Admin
                </NavLink>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-slate-500">{user?.email}</span>
            {me && (
              <span className="text-xs uppercase tracking-wide text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">
                {me.role}
              </span>
            )}
            <button
              type="button"
              onClick={() => signOut()}
              className="text-slate-600 hover:text-slate-900 underline"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-[1200px] mx-auto px-6 py-8">{children}</main>
    </div>
  )
}
