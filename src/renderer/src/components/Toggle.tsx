interface ToggleProps {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}

export function Toggle({ checked, onChange, disabled }: ToggleProps): React.JSX.Element {
  return (
    <div
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      className="relative cursor-pointer transition-all duration-200 shrink-0"
      style={{
        width: 40,
        height: 22,
        borderRadius: 11,
        background: checked ? 'var(--accent)' : 'var(--card-bg)',
        border: `1px solid ${checked ? 'var(--accent)' : 'var(--card-border)'}`,
        boxShadow: checked ? '0 0 12px var(--accent-glow)' : 'none',
        opacity: disabled ? 0.5 : 1
      }}
    >
      <div
        className="absolute top-0.5 transition-all duration-200"
        style={{
          left: checked ? 20 : 2,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 4px rgba(0,0,0,.3)'
        }}
      />
    </div>
  )
}
