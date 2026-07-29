function AuthPage({ mode, form, onChange, onSubmit, onSwitch, error, loading }) {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-heading">
          <p className="eyebrow">FinPsych</p>
          <h1>{mode === 'register' ? 'Create your account' : 'Welcome back'}</h1>
          <p>Track your money, decode your behavior, and build better financial habits.</p>
        </div>

        {error ? <div className="notice error">{error}</div> : null}

        <form onSubmit={onSubmit} className="transaction-form auth-form">
          <input
            required
            type="email"
            name="email"
            placeholder="Email"
            value={form.email}
            onChange={onChange}
          />
          <input
            required
            type="password"
            name="password"
            placeholder="Password"
            value={form.password}
            onChange={onChange}
          />
          <button type="submit">{loading ? 'Working…' : mode === 'register' ? 'Register' : 'Login'}</button>
        </form>

        <button type="button" className="auth-switch" onClick={onSwitch}>
          {mode === 'register' ? 'Already have an account? Login' : 'New here? Register'}
        </button>
      </div>
    </div>
  );
}

export default AuthPage;
