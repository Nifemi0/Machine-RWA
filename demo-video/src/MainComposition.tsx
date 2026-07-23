import { AbsoluteFill, Audio, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

export const MainComposition: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entrance animations
  const logoScale = spring({ fps, frame, config: { damping: 12 } });
  const textOpacity = interpolate(frame, [15, 30], [0, 1], { extrapolateRight: 'clamp' });
  const textY = interpolate(frame, [15, 30], [50, 0], { extrapolateRight: 'clamp' });

  // Scene 2: Network Nodes
  const nodeOpacity = interpolate(frame, [120, 135], [0, 1], { extrapolateRight: 'clamp' });
  
  // Scene 3: CSPR Yield
  const yieldOpacity = interpolate(frame, [220, 240], [0, 1], { extrapolateRight: 'clamp' });

  // Subtitles logic
  let currentSubtitle = '';
  if (frame > 10 && frame < 120) currentSubtitle = "Welcome to Machine RWA, the Casper DePIN Protocol.";
  else if (frame >= 120 && frame < 220) currentSubtitle = "We tokenize physical hardware into yield-bearing assets.";
  else if (frame >= 220) currentSubtitle = "AI agents pay for compute using autonomous micropayments.";

  return (
    <AbsoluteFill style={{ backgroundColor: '#05070a', color: 'white', fontFamily: 'sans-serif', justifyContent: 'center', alignItems: 'center' }}>
      
      {/* Audio Tracks */}
      <Audio src={staticFile("voice1.mp3")} startFrom={10} endAt={120} />
      <Audio src={staticFile("voice2.mp3")} startFrom={120} endAt={220} />
      <Audio src={staticFile("voice3.mp3")} startFrom={220} endAt={350} />

      {/* Intro Scene (0-120) */}
      <div style={{ position: 'absolute', opacity: interpolate(frame, [105, 120], [1, 0]) }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', transform: `scale(${logoScale})` }}>
          <div style={{ width: 120, height: 120, backgroundColor: '#d4a964', color: 'black', borderRadius: 24, display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: 64, fontWeight: 900 }}>M</div>
          <h1 style={{ fontSize: 80, marginTop: 40, opacity: textOpacity, transform: `translateY(${textY}px)` }}>Machine RWA</h1>
          <p style={{ fontSize: 40, color: '#3ba792', marginTop: 10, opacity: textOpacity, transform: `translateY(${textY}px)` }}>Casper DePIN Protocol</p>
        </div>
      </div>

      {/* Network Scene (120-220) */}
      <div style={{ position: 'absolute', opacity: interpolate(frame, [205, 220], [nodeOpacity, 0]) }}>
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
              transform: `scale(${spring({ fps, frame: frame - (120 + i*10), config: { damping: 10 } })})`
            }}>
              GPU Node {i}
            </div>
          ))}
        </div>
      </div>

      {/* Yield Scene (220-350) */}
      <div style={{ position: 'absolute', opacity: yieldOpacity, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <h2 style={{ fontSize: 80, color: '#3ba792' }}>Autonomous Micropayments</h2>
        <div style={{ fontSize: 120, marginTop: 40, color: '#d4a964', fontWeight: 'bold' }}>
          + {Math.floor(interpolate(frame, [240, 320], [0, 500], { extrapolateRight: 'clamp' }))} CSPR Yield
        </div>
      </div>

      {/* Subtitles Overlay */}
      {currentSubtitle && (
        <div style={{ 
          position: 'absolute', 
          bottom: 100, 
          left: 0, 
          right: 0, 
          display: 'flex', 
          justifyContent: 'center', 
          zIndex: 50 
        }}>
          <div style={{
            backgroundColor: 'rgba(0,0,0,0.8)',
            padding: '16px 32px',
            borderRadius: '12px',
            fontSize: 42,
            fontWeight: '600',
            color: '#f1f5f9',
            border: '2px solid rgba(212,169,100,0.3)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
          }}>
            {currentSubtitle}
          </div>
        </div>
      )}

    </AbsoluteFill>
  );
};
