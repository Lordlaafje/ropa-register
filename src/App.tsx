import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import AuthCallback from './pages/AuthCallback'
import Register from './pages/Register'
import ActivityDetail from './pages/ActivityDetail'
import NewChoice from './pages/NewChoice'
import NewQuick from './pages/NewQuick'
import Wizard from './pages/Wizard'
import EditActivity from './pages/EditActivity'
import SubmissionThanks from './pages/SubmissionThanks'
import Admin from './pages/Admin'
import Transfers from './pages/Transfers'
import TransferDetail from './pages/TransferDetail'
import NewTransferChoice from './pages/NewTransferChoice'
import NewTransferQuick from './pages/NewTransferQuick'
import TransferWizard from './pages/TransferWizard'
import EditTransfer from './pages/EditTransfer'
import TransferSubmissionThanks from './pages/TransferSubmissionThanks'
import Forbidden from './pages/Forbidden'
import { AuthProvider, useAuth } from './context/AuthContext'

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading…</div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return children
}

function EditOnly({ children }: { children: JSX.Element }) {
  const { me, meLoading } = useAuth()
  if (meLoading || !me) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading…</div>
      </div>
    )
  }
  if (me.role === 'read') return <Forbidden />
  return children
}

function AdminOnly({ children }: { children: JSX.Element }) {
  const { me, meLoading } = useAuth()
  if (meLoading || !me) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading…</div>
      </div>
    )
  }
  if (me.role !== 'admin') return <Forbidden />
  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Register />
          </ProtectedRoute>
        }
      />
      <Route
        path="/activities/new"
        element={
          <ProtectedRoute>
            <NewChoice />
          </ProtectedRoute>
        }
      />
      <Route
        path="/activities/new/quick"
        element={
          <ProtectedRoute>
            <NewQuick />
          </ProtectedRoute>
        }
      />
      <Route
        path="/activities/new/wizard"
        element={
          <ProtectedRoute>
            <Wizard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/submission-thanks/:id"
        element={
          <ProtectedRoute>
            <SubmissionThanks />
          </ProtectedRoute>
        }
      />
      <Route
        path="/activities/:id"
        element={
          <ProtectedRoute>
            <ActivityDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/activities/:id/edit"
        element={
          <ProtectedRoute>
            <EditOnly>
              <EditActivity />
            </EditOnly>
          </ProtectedRoute>
        }
      />
      <Route path="/transfers" element={<ProtectedRoute><Transfers /></ProtectedRoute>} />
      <Route path="/transfers/new" element={<ProtectedRoute><NewTransferChoice /></ProtectedRoute>} />
      <Route path="/transfers/new/quick" element={<ProtectedRoute><NewTransferQuick /></ProtectedRoute>} />
      <Route path="/transfers/new/wizard" element={<ProtectedRoute><TransferWizard /></ProtectedRoute>} />
      <Route path="/transfer-submission-thanks/:id" element={<ProtectedRoute><TransferSubmissionThanks /></ProtectedRoute>} />
      <Route path="/transfers/:id" element={<ProtectedRoute><TransferDetail /></ProtectedRoute>} />
      <Route path="/transfers/:id/edit" element={<ProtectedRoute><EditOnly><EditTransfer /></EditOnly></ProtectedRoute>} />
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminOnly>
              <Admin />
            </AdminOnly>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
