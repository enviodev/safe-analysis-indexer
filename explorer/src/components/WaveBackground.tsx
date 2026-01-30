export function WaveBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Gradient blob mesh */}
      <div className="absolute inset-0">
        {/* Primary green blob - top right */}
        <div 
          className="absolute -top-20 -right-20 w-96 h-96 rounded-full opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--primary) 0%, transparent 70%)' }}
        />
        
        {/* Secondary green blob - left */}
        <div 
          className="absolute top-1/2 -left-32 w-80 h-80 rounded-full opacity-15 blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--primary) 0%, transparent 70%)' }}
        />
        
        {/* Subtle accent blob - bottom right */}
        <div 
          className="absolute -bottom-10 right-1/4 w-72 h-72 rounded-full opacity-10 blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--primary) 0%, transparent 70%)' }}
        />
        
        {/* Muted blob - center top */}
        <div 
          className="absolute -top-10 left-1/3 w-64 h-64 rounded-full opacity-10 blur-3xl bg-muted-foreground"
        />
        
        {/* Small accent blob - bottom left */}
        <div 
          className="absolute bottom-0 left-1/4 w-48 h-48 rounded-full opacity-15 blur-2xl"
          style={{ background: 'radial-gradient(circle, var(--primary) 0%, transparent 70%)' }}
        />
      </div>
      
      {/* Subtle grid overlay for texture */}
      <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(to right, currentColor 1px, transparent 1px),
            linear-gradient(to bottom, currentColor 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px'
        }}
      />
    </div>
  );
}
