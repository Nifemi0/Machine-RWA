import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export const MainComposition: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entrance animations
  const logoScale = spring({ fps, frame, config: { damping: 12 } });
  const textOpacity = interpolate(frame, [15, 30], [0, 1], { extrapolateRight: 'clamp' });
  const textY = interpolate(frame, [15, 30], [50, 0], { extrapolateRight: 'clamp' });

  // Scene 2: Network Nodes
  const nodeOpacity = interpolate(frame, [90, 105], [0, 1], { extrapolateRight: 'clamp' });
  
  // Scene 3: CSPR Yield
  const yieldOpacity = interpolate(frame, [180, 200], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: '#05070a', color: 'white', fontFamily: 'sans-serif', justifyContent: 'center', alignItems: 'center' }}>
      
      {/* Intro Scene (0-90) */}
      <div style={{ position: 'absolute', opacity: interpolate(frame, [80, 95], [1, 0]) }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', transform: `scale(${logoScale})` }}>
          <div style={{ width: 120, height: 120, backgroundColor: '#d4a964', color: 'black', borderRadius: 24, display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: 64, fontWeight: 900 }}>M</div>
          <h1 style={{ fontSize: 80, marginTop: 40, opacity: textOpacity, transform: `translateY(${textY}px)` }}>Machine RWA</h1>
          <p style={{ fontSize: 40, color: '#3ba792', marginTop: 10, opacity: textOpacity, transform: `translateY(${textY}px)` }}>Casper DePIN Protocol</p>
        </div>
      </div>

      {/* Network Scene (90-180) */}
      <div style={{ position: 'absolute', opacity: interpolate(frame, [170, 185], [nodeOpacity, 0]) }}>
        <h2 style={{ fontSize: 64, color: 'white', textAlign: 'center' }}>Tokenizing Physical Hardware</h2>
        <div style={{ display: 'flex', gap: 40, marginTop: 60 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ 
              width: 300, height: 200, 
              backgroundColor: '#111827', 
              border: '4px solid #d4a964', 
              borderRadius: 20,
              display: 'flex', justifyContent: 'center', alignItems: 'center',
              fontSize: 32,
              transform: `scale(${spring({ fps, frame: frame - (90 + i*10), config: { damping: 10 } })})`
            }}>
              GPU Node {i}
            </div>
          ))}
        </div>
      </div>

      {/* Yield Scene (180-300) */}
      <div style={{ position: 'absolute', opacity: yieldOpacity, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <h2 style={{ fontSize: 80, color: '#3ba792' }}>Autonomous x402 Micropayments</h2>
        <div style={{ fontSize: 120, marginTop: 40, color: '#d4a964', fontWeight: 'bold' }}>
          + {Math.floor(interpolate(frame, [200, 280], [0, 500], { extrapolateRight: 'clamp' }))} CSPR Yield
        </div>
      </div>

    </AbsoluteFill>
  );
};
